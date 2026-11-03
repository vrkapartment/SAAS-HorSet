"use server"

import { createClient } from "@/lib/supabase/server"
import { createActorServiceClient } from "@/lib/supabase/service-actor"
import { assertWorkspaceFeatureEnabled } from "@/features/subscription/actions"
import { DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import {
  buildSettlementDocument,
  formatThaiDate,
  parseCheckoutSettlement,
  type SettlementDocument
} from "@/features/tenant/checkout-settlement"

/**
 * ส่งใบสรุปการย้ายออก/คืนเงินประกันเข้า LINE ของผู้เช่าที่ย้ายออกไปแล้ว
 *
 * ต่างจากบิลค่าเช่า (sendLineBillNotificationAction):
 *   - ผู้เช่าย้ายออกแล้ว แถว tenants ถูกลบ → LINE id อ่านจาก tenants_old ฝั่ง server เท่านั้น
 *     (ไม่รับ LINE id จาก client — กันการยิงข้อความไปหาคนอื่น)
 *   - portal ใช้ไม่ได้แล้ว (ลิงก์ผูกกับแถว tenants) การ์ดจึงแสดงรายละเอียดครบในตัว ไม่มีปุ่มลิงก์
 *   - LINE ส่งไฟล์ PDF ไม่ได้ ผู้ดูแลบันทึก PDF แยกจากหน้า /rooms
 */
export async function sendCheckoutSettlementLineAction(contractId: string): Promise<
  { success: true; sentAt: string } | { success: false; error: string }
> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { success: false, error: "กรุณาเข้าสู่ระบบก่อนดำเนินการ" }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, workspace_id, permissions")
      .eq("id", user.id)
      .single()
    if (!profile) {
      return { success: false, error: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }
    }

    // สิทธิ์เดียวกับปุ่มส่งบิลค่าเช่าทาง LINE
    if (profile.role === "staff") {
      let perms: unknown = profile.permissions
      if (typeof perms === "string") {
        try { perms = JSON.parse(perms) } catch { perms = null }
      }
      const merged = { ...DEFAULT_STAFF_PERMISSIONS, ...(typeof perms === "object" && perms !== null ? perms : {}) }
      if (!merged.billing_send_line) {
        return { success: false, error: "คุณไม่มีสิทธิ์ส่งข้อความ LINE ถึงผู้เช่า" }
      }
    } else if (profile.role !== "admin" && profile.role !== "super_admin") {
      return { success: false, error: "คุณไม่มีสิทธิ์ส่งข้อความ LINE ถึงผู้เช่า" }
    }

    // อ่านผ่าน RLS ของผู้เรียก — ไม่เห็นแถว = ไม่มีสิทธิ์ในหอนั้น
    const { data: c, error: contractError } = await supabase
      .from("cancelled_contracts")
      .select("*")
      .eq("id", contractId)
      .is("reverted_at", null)
      .maybeSingle()
    if (contractError || !c) {
      return { success: false, error: "ไม่พบประวัติการย้ายออกรายการนี้" }
    }
    if (profile.role !== "super_admin" && profile.workspace_id !== c.workspace_id) {
      return { success: false, error: "คุณไม่มีสิทธิ์ในหอพักนี้" }
    }
    const workspaceId: string = c.workspace_id

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    if (!c.tenant_id) {
      return { success: false, error: "ประวัตินี้ไม่ได้ผูกกับผู้เช่าในระบบ จึงไม่รู้ว่าจะส่ง LINE ถึงใคร" }
    }
    const { data: oldTenant } = await supabase
      .from("tenants_old")
      .select("line_user_id")
      .eq("workspace_id", workspaceId)
      .eq("tenant_id", c.tenant_id)
      .not("line_user_id", "is", null)
      .order("moved_out_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const lineUserId = typeof oldTenant?.line_user_id === "string" ? oldTenant.line_user_id.trim() : ""
    if (!lineUserId) {
      return { success: false, error: "ผู้เช่ารายนี้ไม่ได้เชื่อม LINE ไว้ตอนย้ายออก" }
    }

    // token ของหอ — วิธีเดียวกับการส่งบิลค่าเช่า (ไม่มีของหอ ถอยไปใช้ OA กลางของระบบ)
    const { data: lineSettings } = await supabase
      .from("workspace_line_settings")
      .select("channel_access_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    const channelAccessToken = (lineSettings?.channel_access_token || process.env.LINE_CHANNEL_ACCESS_TOKEN || "").trim()
    if (!channelAccessToken || channelAccessToken === "placeholder") {
      return { success: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token สำหรับหอพักนี้" }
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle()

    const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    const doc = buildSettlementDocument({
      roomNumber: c.room_number || "-",
      tenantName: c.tenant_name || "-",
      cancellationDate: c.cancellation_date || "",
      depositAmount: Number(c.deposit_amount || 0),
      actualRefund: Number(c.actual_refund ?? c.refunded_amount ?? 0),
      forfeitedAmount: Number(c.forfeited_amount || 0),
      deductedRent405: Number(c.deducted_rent_405 || 0),
      deductedUtilities408: Number(c.deducted_utilities_408 || 0),
      deductedServices408: Number(c.deducted_services_408 || 0),
      closingElecPrev: numOrNull(c.closing_elec_prev),
      closingElecCurr: numOrNull(c.closing_elec_curr),
      closingWaterPrev: numOrNull(c.closing_water_prev),
      closingWaterCurr: numOrNull(c.closing_water_curr),
      settlement: parseCheckoutSettlement(c.settlement)
    })

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${channelAccessToken}`
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        to: lineUserId,
        messages: [{
          type: "flex",
          altText: `สรุปการย้ายออกห้อง ${doc.roomNumber} — คืนเงินประกัน ${money(doc.refund)} บาท`,
          contents: buildSettlementFlex(doc, workspace?.name || "หอพัก")
        }]
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("LINE Messaging API Error (checkout settlement):", errorData)
      const detail = typeof errorData?.message === "string" ? errorData.message : `LINE API Status Code: ${response.status}`
      return { success: false, error: `LINE API Error: ${detail}` }
    }

    // จดเวลาที่ส่ง — เขียนผ่าน service role พก actor (RLS ของตารางนี้ให้ admin เขียน; staff ที่มีสิทธิ์ส่ง LINE ก็ต้องจดได้)
    const sentAt = new Date().toISOString()
    const service = createActorServiceClient(user.id)
    const writer = service ?? supabase
    const { error: markError } = await writer
      .from("cancelled_contracts")
      .update({ line_sent_at: sentAt })
      .eq("id", contractId)
    if (markError) {
      console.warn("ส่ง LINE สำเร็จ แต่จดเวลาที่ส่งไม่สำเร็จ:", markError.message)
    }

    return { success: true, sentAt }
  } catch (error) {
    console.error("sendCheckoutSettlementLineAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "ส่งใบสรุปการย้ายออกทาง LINE ไม่สำเร็จ" }
  }
}

function money(value: number): string {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// LINE ปฏิเสธทั้งก้อนถ้ามี text ว่าง — ใส่ "-" แทนเสมอ
function safe(text: string | undefined | null): string {
  const t = (text ?? "").trim()
  return t === "" ? "-" : t
}

function row(label: string, value: string, opts: { bold?: boolean; color?: string; size?: string } = {}) {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: safe(label), size: opts.size || "sm", color: "#555555", flex: 6, wrap: true, weight: opts.bold ? "bold" : "regular" },
      { type: "text", text: safe(value), size: opts.size || "sm", color: opts.color || "#111111", flex: 4, align: "end", weight: opts.bold ? "bold" : "regular" }
    ]
  }
}

function buildSettlementFlex(doc: SettlementDocument, workspaceName: string) {
  const lineRows = doc.lines.flatMap(line => {
    const rows: unknown[] = [row(line.label, `${money(line.amount)} ฿`)]
    if (line.detail) {
      rows.push({ type: "text", text: safe(line.detail), size: "xs", color: "#888888", wrap: true, margin: "xs" })
    }
    return rows
  })

  return {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#0F172A",
      paddingAll: "16px",
      contents: [
        { type: "text", text: safe(workspaceName), size: "xs", color: "#A5B4FC" },
        { type: "text", text: "สรุปการย้ายออกและคืนเงินประกัน", size: "md", weight: "bold", color: "#FFFFFF", wrap: true, margin: "sm" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        row("ห้อง", doc.roomNumber),
        row("ผู้เช่า", doc.tenantName),
        row("วันที่ย้ายออก", formatThaiDate(doc.cancellationDate)),
        { type: "separator", margin: "md" },
        { type: "text", text: "รายการหักจากเงินประกัน", size: "sm", weight: "bold", margin: "md", color: "#111111" },
        ...lineRows,
        { type: "separator", margin: "md" },
        row("เงินประกันที่ชำระไว้", `${money(doc.depositAmount)} ฿`),
        row("รวมรายการหัก", `${money(doc.totalDeductions)} ฿`),
        ...(doc.breachNote
          ? [{ type: "text", text: doc.breachNote, size: "xs", color: "#B91C1C", wrap: true, margin: "sm" }]
          : []),
        { type: "separator", margin: "md" },
        row("ยอดเงินคืนผู้เช่า", `${money(doc.refund)} ฿`, { bold: true, color: "#047857", size: "md" })
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "ขอบคุณที่ใช้บริการ หากข้อมูลไม่ถูกต้องกรุณาติดต่อผู้ดูแลหอพัก", size: "xxs", color: "#999999", wrap: true, align: "center" }
      ]
    }
  }
}
