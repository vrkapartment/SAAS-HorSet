import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { verifySlipWithHorSetSlipOk, computeSubscriptionPeriodWithTrialCarryover } from "@/features/subscription/actions"
import { SLIPOK_RETRYABLE_ERROR_CODES } from "@/features/slipok/constants"
import { sendLineSubscriptionNotificationAction } from "@/features/notification/actions"

export const dynamic = "force-dynamic"

// จำนวนแถวสูงสุดที่ประมวลผลต่อรอบ ป้องกัน cron รันนานเกินไปหากมีคิวค้างจำนวนมาก
const BATCH_LIMIT = 50

// grace period หลัง current_period_end หมดจริงก่อนบล็อกเป็น read_only (ให้เวลาเจ้าของหอโอนเงิน/รอ SlipOK ตรวจ)
const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบความปลอดภัยด้วย CRON_SECRET เช่นเดียวกับ cron job อื่นๆ ในระบบ
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const { searchParams } = new URL(request.url)
    const paramSecret = searchParams.get("secret")

    if (cronSecret) {
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null
      if (token !== cronSecret && paramSecret !== cronSecret) {
        return NextResponse.json(
          { success: false, error: "สิทธิ์การเข้าถึงไม่ถูกต้อง (Unauthorized)" },
          { status: 401 }
        )
      }
    } else {
      console.warn("⚠️ CRON_SECRET is not configured. Running cron job without secret verification.")
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.json(
        { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" },
        { status: 500 }
      )
    }

    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const nowIso = new Date().toISOString()
    const pastDueGraceThresholdIso = new Date(Date.now() - PAST_DUE_GRACE_MS).toISOString()

    const warnings: string[] = []

    // =====================================================================
    // ส่วนที่ 1: ตรวจ trial/renewal หมดอายุ (bulk UPDATE ตามเงื่อนไข ไม่ต้องวน loop)
    // =====================================================================

    // 1.1 trial หมดอายุ -> read_only
    const { data: trialToReadOnly, error: trialError } = await supabaseAdmin
      .from("workspace_subscriptions")
      .update({ status: "read_only" })
      .eq("status", "trial")
      .lt("trial_ends_at", nowIso)
      .select("workspace_id")

    if (trialError) {
      console.error("Error updating expired trial subscriptions:", trialError)
      warnings.push(`ตรวจสอบ trial หมดอายุไม่สำเร็จ: ${trialError.message}`)
    }

    // 1.2 active ที่ครบรอบบิลแล้ว -> past_due (ให้ grace period ก่อน ยังไม่บล็อกทันที)
    const { data: activeToPastDue, error: activeError } = await supabaseAdmin
      .from("workspace_subscriptions")
      .update({ status: "past_due" })
      .eq("status", "active")
      .lt("current_period_end", nowIso)
      .select("workspace_id")

    if (activeError) {
      console.error("Error updating expired active subscriptions:", activeError)
      warnings.push(`ตรวจสอบ active ครบรอบบิลไม่สำเร็จ: ${activeError.message}`)
    }

    // 1.3 past_due ที่เลย grace period 3 วันแล้ว -> read_only
    const { data: pastDueToReadOnly, error: pastDueError } = await supabaseAdmin
      .from("workspace_subscriptions")
      .update({ status: "read_only" })
      .eq("status", "past_due")
      .lt("current_period_end", pastDueGraceThresholdIso)
      .select("workspace_id")

    if (pastDueError) {
      console.error("Error updating expired past_due subscriptions:", pastDueError)
      warnings.push(`ตรวจสอบ past_due เลย grace period ไม่สำเร็จ: ${pastDueError.message}`)
    }

    // 1.4 cancelled ที่ครบวันหมดอายุเดิมแล้ว (current_period_end ถูกตั้งไว้ตอนกดยกเลิกให้เท่ากับวันหมดอายุเดิม) -> read_only
    // ไม่บล็อกทันทีตอนกดยกเลิก เพื่อให้ยังใช้งานได้ปกติจนถึงวันที่จ่ายเงิน/ทดลองใช้ไว้ครบจริง
    const { data: cancelledToReadOnly, error: cancelledError } = await supabaseAdmin
      .from("workspace_subscriptions")
      .update({ status: "read_only" })
      .eq("status", "cancelled")
      .lt("current_period_end", nowIso)
      .select("workspace_id")

    if (cancelledError) {
      console.error("Error updating expired cancelled subscriptions:", cancelledError)
      warnings.push(`ตรวจสอบ cancelled หมดอายุไม่สำเร็จ: ${cancelledError.message}`)
    }

    const subscriptionStatusChanges = {
      trial_to_read_only: trialToReadOnly?.length || 0,
      active_to_past_due: activeToPastDue?.length || 0,
      past_due_to_read_only: pastDueToReadOnly?.length || 0,
      cancelled_to_read_only: cancelledToReadOnly?.length || 0
    }

    // =====================================================================
    // ส่วนที่ 1.5: แจ้งเตือน LINE ไปยัง Admin ของแต่ละหอที่เพิ่งถูกเปลี่ยนสถานะจริงในรอบนี้
    // (ยิงแบบ fire-and-forget ต่อ workspace ไม่ให้ error ของหอใดหอหนึ่งไปบล็อก response ของ cron รอบนี้)
    // =====================================================================
    const notificationJobs: Array<Promise<unknown>> = []

    for (const row of trialToReadOnly || []) {
      notificationJobs.push(sendLineSubscriptionNotificationAction(row.workspace_id, "trial_locked"))
    }
    for (const row of activeToPastDue || []) {
      notificationJobs.push(sendLineSubscriptionNotificationAction(row.workspace_id, "past_due"))
    }
    for (const row of pastDueToReadOnly || []) {
      notificationJobs.push(sendLineSubscriptionNotificationAction(row.workspace_id, "payment_failed_locked"))
    }
    for (const row of cancelledToReadOnly || []) {
      notificationJobs.push(sendLineSubscriptionNotificationAction(row.workspace_id, "cancelled_locked"))
    }

    if (notificationJobs.length > 0) {
      const notificationResults = await Promise.allSettled(notificationJobs)
      notificationResults.forEach((result) => {
        if (result.status === "rejected") {
          console.error("Error sending subscription status LINE notification:", result.reason)
        }
      })
    }

    // =====================================================================
    // ส่วนที่ 2: retry คิว SlipOK ของการจ่ายค่า subscription (saas_payment_retry_queue)
    // =====================================================================

    const { data: dueItems, error: fetchError } = await supabaseAdmin
      .from("saas_payment_retry_queue")
      .select("id, saas_payment_id, workspace_id, slip_url, amount, attempt_count, max_attempts")
      .eq("status", "pending")
      .lte("next_retry_at", nowIso)
      .limit(BATCH_LIMIT)

    if (fetchError) {
      console.error("Error fetching saas payment retry queue:", fetchError)
      return NextResponse.json({
        success: true,
        message: "ตรวจสอบสถานะ trial/renewal เรียบร้อยแล้ว แต่เกิดข้อผิดพลาดในการดึงคิว retry การชำระเงิน subscription",
        subscriptionStatusChanges,
        paymentRetryProcessed: 0,
        paymentRetryDetails: [],
        warnings: [...warnings, `เกิดข้อผิดพลาดในการดึงคิว retry: ${fetchError.message}`]
      })
    }

    const paymentRetryDetails: Array<{ queue_id: string; saas_payment_id: string; outcome: string }> = []

    if (dueItems && dueItems.length > 0) {
      for (const item of dueItems) {
        try {
          // ตรวจสถานะการจ่ายเงินปัจจุบันก่อนทุกครั้ง เผื่อ super admin เข้ามาตรวจ/ยกเลิกเองแล้วระหว่างรอคิว
          const { data: payment } = await supabaseAdmin
            .from("saas_payments")
            .select("id, status, plan_id, billing_cycle, amount")
            .eq("id", item.saas_payment_id)
            .maybeSingle()

          if (!payment || payment.status !== "pending") {
            await supabaseAdmin
              .from("saas_payment_retry_queue")
              .update({ status: "cancelled", updated_at: new Date().toISOString() })
              .eq("id", item.id)
            paymentRetryDetails.push({ queue_id: item.id, saas_payment_id: item.saas_payment_id, outcome: "cancelled_payment_changed" })
            continue
          }

          const verifyRes = await verifySlipWithHorSetSlipOk(item.slip_url, Number(payment.amount))

          if (verifyRes.success) {
            const now = new Date()
            // ใช้ helper เดียวกับ uploadSubscriptionSlip (verify สำเร็จทันที) เพื่อให้ trial-carryover
            // ทำงานเหมือนกันไม่ว่า SlipOK จะผ่านตั้งแต่ครั้งแรกหรือผ่านตอน retry ผ่านคิวนี้
            const { periodStart, currentPeriodEnd } = await computeSubscriptionPeriodWithTrialCarryover(
              supabaseAdmin,
              item.workspace_id,
              payment.billing_cycle
            )

            await supabaseAdmin
              .from("saas_payment_retry_queue")
              .update({ status: "succeeded", updated_at: now.toISOString() })
              .eq("id", item.id)

            await supabaseAdmin
              .from("saas_payments")
              .update({ status: "verified", verified_at: now.toISOString() })
              .eq("id", item.saas_payment_id)

            const { error: subUpsertError } = await supabaseAdmin
              .from("workspace_subscriptions")
              .upsert(
                {
                  workspace_id: item.workspace_id,
                  plan_id: payment.plan_id,
                  status: "active",
                  billing_cycle: payment.billing_cycle,
                  current_period_start: periodStart.toISOString(),
                  current_period_end: currentPeriodEnd.toISOString()
                },
                { onConflict: "workspace_id" }
              )

            if (subUpsertError) {
              console.error(`Error upserting workspace_subscriptions for retry queue item ${item.id}:`, subUpsertError)
            }

            paymentRetryDetails.push({ queue_id: item.id, saas_payment_id: item.saas_payment_id, outcome: "succeeded" })
            continue
          }

          const nextAttemptCount = item.attempt_count + 1
          const stillRetryable = !!verifyRes.code && SLIPOK_RETRYABLE_ERROR_CODES.includes(verifyRes.code)

          if (stillRetryable && nextAttemptCount < item.max_attempts) {
            await supabaseAdmin
              .from("saas_payment_retry_queue")
              .update({
                attempt_count: nextAttemptCount,
                next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                last_error_code: verifyRes.code,
                last_error_message: verifyRes.error,
                updated_at: new Date().toISOString()
              })
              .eq("id", item.id)
            paymentRetryDetails.push({ queue_id: item.id, saas_payment_id: item.saas_payment_id, outcome: `retry_scheduled_attempt_${nextAttemptCount}` })
            continue
          }

          // ครบจำนวนครั้งที่ retry ได้แล้วแต่ยังไม่ผ่าน หรือเจอ error ที่ retry ต่อไปก็ไม่มีประโยชน์ -> ปิดเป็น failed ให้ super admin ตรวจเอง
          await supabaseAdmin
            .from("saas_payment_retry_queue")
            .update({
              status: "failed",
              attempt_count: nextAttemptCount,
              last_error_code: verifyRes.code,
              last_error_message: verifyRes.error,
              updated_at: new Date().toISOString()
            })
            .eq("id", item.id)

          await supabaseAdmin
            .from("saas_payments")
            .update({ status: "failed" })
            .eq("id", item.saas_payment_id)

          paymentRetryDetails.push({ queue_id: item.id, saas_payment_id: item.saas_payment_id, outcome: "failed" })
        } catch (itemErr: unknown) {
          console.error(`Error processing saas payment retry queue item ${item.id}:`, itemErr)
          paymentRetryDetails.push({ queue_id: item.id, saas_payment_id: item.saas_payment_id, outcome: "error" })
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "ตรวจสอบสถานะ subscription และประมวลผลคิวชำระเงินเรียบร้อยแล้ว",
      subscriptionStatusChanges,
      subscriptionNotificationsSent: notificationJobs.length,
      paymentRetryProcessed: paymentRetryDetails.length,
      paymentRetryDetails,
      ...(warnings.length > 0 ? { warnings } : {})
    })
  } catch (err: unknown) {
    console.error("Subscription Check Cron Job Error:", err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการประมวลผลระบบอัตโนมัติ" },
      { status: 500 }
    )
  }
}