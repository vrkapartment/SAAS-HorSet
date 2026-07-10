import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { verifySlipWithSlipOk } from "@/features/slipok/actions"
import { SLIPOK_RETRYABLE_ERROR_CODES } from "@/features/slipok/constants"
import { sendLineSlipNotificationAction } from "@/features/notification/actions"

export const dynamic = "force-dynamic"

// จำนวนแถวสูงสุดที่ประมวลผลต่อรอบ ป้องกัน cron รันนานเกินไปหากมีคิวค้างจำนวนมาก
const BATCH_LIMIT = 50

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

    // 2. ดึงรายการที่ครบเวลาต้องตรวจซ้ำ (next_retry_at ผ่านไปแล้ว และยังอยู่ในสถานะ pending)
    const nowIso = new Date().toISOString()
    const { data: dueItems, error: fetchError } = await supabaseAdmin
      .from("slipok_retry_queue")
      .select("id, bill_id, workspace_id, slip_url, amount, attempt_count, max_attempts")
      .eq("status", "pending")
      .lte("next_retry_at", nowIso)
      .limit(BATCH_LIMIT)

    if (fetchError) {
      console.error("Error fetching SlipOK retry queue:", fetchError)
      return NextResponse.json(
        { success: false, error: `เกิดข้อผิดพลาดในการดึงคิว retry: ${fetchError.message}` },
        { status: 500 }
      )
    }

    if (!dueItems || dueItems.length === 0) {
      return NextResponse.json({ success: true, message: "ไม่มีรายการที่ครบเวลาตรวจสลิปซ้ำ", processed: 0, details: [] })
    }

    const details: Array<{ queue_id: string; bill_id: string; outcome: string }> = []

    for (const item of dueItems) {
      try {
        // ตรวจสถานะบิลปัจจุบันก่อนทุกครั้ง เผื่อ staff เข้ามาตรวจ/ยืนยันเองแล้วระหว่างรอคิว หรือสลิปถูกเปลี่ยนไปแล้ว
        const { data: bill } = await supabaseAdmin
          .from("bills")
          .select("id, status, slip_url")
          .eq("id", item.bill_id)
          .maybeSingle()

        if (!bill || bill.status !== "pending" || bill.slip_url !== item.slip_url) {
          await supabaseAdmin
            .from("slipok_retry_queue")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", item.id)
          details.push({ queue_id: item.id, bill_id: item.bill_id, outcome: "cancelled_bill_changed" })
          continue
        }

        const verifyRes = await verifySlipWithSlipOk(item.workspace_id, item.slip_url, item.amount ?? undefined)

        if (verifyRes.success) {
          await supabaseAdmin
            .from("slipok_retry_queue")
            .update({ status: "succeeded", updated_at: new Date().toISOString() })
            .eq("id", item.id)
          // SlipOK ตรวจสอบสลิปผ่านแล้ว -> ปิดบิลเป็น "ชำระเงินแล้ว" ให้ทันทีโดยไม่ต้องรอ staff กดยืนยันซ้ำ
          await supabaseAdmin
            .from("bills")
            .update({ status: "paid", updated_at: new Date().toISOString() })
            .eq("id", item.bill_id)
          await sendLineSlipNotificationAction(item.bill_id, item.workspace_id, "success")
          details.push({ queue_id: item.id, bill_id: item.bill_id, outcome: "succeeded" })
          continue
        }

        const nextAttemptCount = item.attempt_count + 1
        const stillRetryable = !!verifyRes.code && SLIPOK_RETRYABLE_ERROR_CODES.includes(verifyRes.code)

        if (stillRetryable && nextAttemptCount < item.max_attempts) {
          await supabaseAdmin
            .from("slipok_retry_queue")
            .update({
              attempt_count: nextAttemptCount,
              next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              last_error_code: verifyRes.code,
              last_error_message: verifyRes.error,
              updated_at: new Date().toISOString()
            })
            .eq("id", item.id)
          details.push({ queue_id: item.id, bill_id: item.bill_id, outcome: `retry_scheduled_attempt_${nextAttemptCount}` })
          continue
        }

        // ครบจำนวนครั้งที่ retry ได้แล้วแต่ยังไม่ผ่าน หรือเจอ error ที่ retry ต่อไปก็ไม่มีประโยชน์ -> แจ้งเตือนแอดมินให้ตรวจเอง
        await supabaseAdmin
          .from("slipok_retry_queue")
          .update({
            status: "failed",
            attempt_count: nextAttemptCount,
            last_error_code: verifyRes.code,
            last_error_message: verifyRes.error,
            updated_at: new Date().toISOString()
          })
          .eq("id", item.id)
        await sendLineSlipNotificationAction(
          item.bill_id,
          item.workspace_id,
          "warning",
          verifyRes.error || "ตรวจสอบสลิปอัตโนมัติไม่ผ่าน กรุณาตรวจสอบด้วยตนเอง"
        )
        details.push({ queue_id: item.id, bill_id: item.bill_id, outcome: "failed_notified" })
      } catch (itemErr: unknown) {
        console.error(`Error processing SlipOK retry queue item ${item.id}:`, itemErr)
        details.push({ queue_id: item.id, bill_id: item.bill_id, outcome: "error" })
      }
    }

    return NextResponse.json({
      success: true,
      message: "ประมวลผลคิวตรวจสอบสลิปซ้ำเรียบร้อยแล้ว",
      processed: details.length,
      details
    })
  } catch (err: unknown) {
    console.error("SlipOK Retry Cron Job Error:", err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการประมวลผลระบบอัตโนมัติ" },
      { status: 500 }
    )
  }
}
