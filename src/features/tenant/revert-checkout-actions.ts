"use server"

import { createClient } from "@/lib/supabase/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createActorServiceClient } from "@/lib/supabase/service-actor"
import { parseRevertCheckoutResult, type RevertCheckoutResult } from "@/features/tenant/revert-checkout"

/**
 * ยกเลิกการคืนห้อง/ย้ายออกที่ยืนยันคืนเงินประกันไปแล้ว (ดู database_patch_add_revert_checkout.sql)
 *
 * งานทั้งหมดอยู่ในฟังก์ชัน revert_checkout() ของฐานข้อมูล ซึ่งทำใน transaction เดียว
 * — ย้อน 4-7 ตารางจากฝั่งนี้ทีละคำสั่งจะค้างครึ่งทางได้เมื่อขั้นกลางล้ม
 *
 * ฟังก์ชันนั้นเรียกได้เฉพาะ service_role จึงต้องผ่าน action นี้เท่านั้น
 * (ไม่งั้นแอดมินยิง RPC ตรงแล้วข้ามขั้นยืนยันรหัสผ่านได้)
 */

type AdminGuard =
  | { ok: true; userId: string; email: string; workspaceId: string }
  | { ok: false; error: string }

/** เฉพาะ Admin ของหอ — ไม่รวม Staff และ Super Admin (ต้องเป็นเจ้าของรหัสของหอนั้นเอง) */
async function requireWorkspaceAdmin(): Promise<AdminGuard> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, workspace_id")
    .eq("id", user.id)
    .single()
  if (profileError || !profile) {
    return { ok: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
  }
  if (profile.role !== "admin" || !profile.workspace_id) {
    return { ok: false, error: "เฉพาะผู้ดูแล (Admin) ของหอนี้เท่านั้นที่ยกเลิกการคืนห้องได้" }
  }
  if (!user.email) {
    return { ok: false, error: "ไม่พบอีเมลของบัญชีนี้ จึงยืนยันรหัสผ่านไม่ได้" }
  }

  return { ok: true, userId: user.id, email: user.email, workspaceId: profile.workspace_id }
}

async function callRevertCheckout(
  actorId: string,
  contractId: string,
  dryRun: boolean,
  expectedTransferId: string | null
): Promise<RevertCheckoutResult> {
  const service = createActorServiceClient(actorId)
  if (!service) {
    return { success: false, error: "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงยกเลิกการคืนห้องไม่ได้" }
  }

  const { data, error } = await service.rpc("revert_checkout", {
    p_contract_id: contractId,
    p_actor: actorId,
    p_dry_run: dryRun,
    p_expected_transfer_id: expectedTransferId
  })

  if (error) {
    // 42883 = ไม่พบฟังก์ชัน → ยังไม่ได้รัน patch
    if (error.code === "42883" || error.code === "PGRST202") {
      return { success: false, error: "ยังไม่ได้รัน database_patch_add_revert_checkout.sql ในฐานข้อมูล" }
    }
    return { success: false, error: `ยกเลิกการคืนห้องไม่สำเร็จ: ${error.message}` }
  }

  return parseRevertCheckoutResult(data)
}

/**
 * ตรวจอย่างเดียว — บอกหน้าจอว่าจะเกิดอะไรขึ้น (มีผู้เช่าย้ายเข้ามาทับหรือไม่) หรือทำไม่ได้เพราะอะไร
 */
export async function previewRevertCheckout(contractId: string): Promise<RevertCheckoutResult> {
  try {
    const guard = await requireWorkspaceAdmin()
    if (!guard.ok) return { success: false, error: guard.error }

    return await callRevertCheckout(guard.userId, contractId, true, null)
  } catch (error) {
    const message = error instanceof Error ? error.message : "ตรวจสอบการยกเลิกการคืนห้องไม่สำเร็จ"
    return { success: false, error: message }
  }
}

export async function revertCheckout(input: {
  contractId: string
  password: string
  /** id การย้ายห้องที่ผู้ดูแลยืนยันให้ย้ายกลับ (null = ไม่มีการย้ายห้องเข้ามาทับ) */
  expectedTransferId: string | null
  /**
   * โทเค็น Cloudflare Turnstile — Supabase เปิด CAPTCHA ของการล็อกอินไว้
   * การยืนยันรหัสผ่าน (signInWithPassword) จึงต้องแนบโทเค็นเหมือนหน้า login
   */
  captchaToken?: string
}): Promise<RevertCheckoutResult> {
  try {
    if (!input.password) {
      return { success: false, error: "กรุณากรอกรหัสผ่านของบัญชี Admin เพื่อยืนยัน" }
    }

    const guard = await requireWorkspaceAdmin()
    if (!guard.ok) return { success: false, error: guard.error }

    const { assertSubscriptionActive } = await import("@/features/subscription/actions")
    await assertSubscriptionActive(guard.workspaceId)

    // ยืนยันรหัสผ่านของ Admin ที่ล็อกอินอยู่
    // ใช้ client ชั่วคราวที่ไม่เก็บ session เพื่อไม่ให้ไปทับ cookie ของ session ปัจจุบัน
    // (วิธีเดียวกับการลบหอพักของ Super Admin ใน features/super-admin/actions.ts)
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!anonKey || anonKey.includes("placeholder")) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_ANON_KEY จึงยืนยันรหัสผ่านไม่ได้" }
    }
    const verifyClient = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error: signInError } = await verifyClient.auth.signInWithPassword({
      email: guard.email,
      password: input.password,
      options: { captchaToken: input.captchaToken || undefined }
    })
    if (signInError) {
      if (/captcha/i.test(signInError.message)) {
        return {
          success: false,
          error: "ตรวจสอบความปลอดภัย (Cloudflare) ไม่ผ่านหรือหมดอายุ กรุณาติ๊กตรวจสอบใหม่แล้วลองอีกครั้ง"
        }
      }
      return { success: false, error: "รหัสผ่านไม่ถูกต้อง — ยังไม่ได้ยกเลิกการคืนห้อง" }
    }

    return await callRevertCheckout(guard.userId, input.contractId, false, input.expectedTransferId)
  } catch (error) {
    const message = error instanceof Error ? error.message : "ยกเลิกการคืนห้องไม่สำเร็จ"
    return { success: false, error: message }
  }
}
