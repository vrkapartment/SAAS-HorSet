"use server"

import { createClient } from "@/lib/supabase/server"
import { generatePortalToken } from "@/features/tenant/actions"
import { calculateLateDays } from "@/features/billing/utils"
import { assertWorkspaceFeatureEnabled } from "@/features/subscription/actions"

/**
 * ฟังก์ชันจำลองสำหรับระบบส่งข้อความแจ้งเตือนผ่าน LINE Messaging API (เก็บไว้เพื่อความเสถียรของระบบเก่า)
 */
export async function sendNotificationPlaceholder() {
  try {
    const supabase = await createClient()
    return { success: true, data: "ส่งการแจ้งเตือน LINE สำเร็จ (ตัวอย่าง)" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
    return { success: false, error: errorMessage }
  }
}

interface LineBillNotificationPayload {
  lineUserId: string
  roomNumber: string
  /** rooms.id — ใช้สร้างลิงก์ดูบิล ต้องส่งมาเสมอ เลขห้องซ้ำกันได้ข้ามอาคารจึงใช้เป็นตัวระบุไม่ได้ */
  roomId?: string | null
  tenantName: string
  billingCycle: string
  baseRent: number
  electricUnits: number
  electricAmount: number
  waterUnits: number
  waterAmount: number
  commonFee?: number
  totalAmount: number
  workspaceName: string
  workspaceId?: string
  extraExpenses?: Array<{ name: string; amount: number }>
}

/**
 * ฟังก์ชันสำหรับระบบส่งข้อความแจ้งเตือนบิลจริงผ่าน LINE Messaging API
 */
export async function sendLineBillNotificationAction(payload: LineBillNotificationPayload) {
  try {
    const {
      lineUserId,
      roomNumber,
      roomId,
      tenantName,
      billingCycle,
      baseRent,
      electricUnits,
      electricAmount,
      waterUnits,
      waterAmount,
      commonFee = 0,
      totalAmount,
      workspaceName,
      workspaceId,
      extraExpenses = [],
    } = payload

    if (workspaceId) await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()
    let channelAccessToken = ""

    // 1. Try to fetch token from workspace_line_settings table first if workspaceId is provided
    if (workspaceId) {
      try {
        const { data: wsSettings, error: wsError } = await supabase
          .from("workspace_line_settings")
          .select("channel_access_token")
          .eq("workspace_id", workspaceId)
          .maybeSingle()

        if (!wsError && wsSettings && wsSettings.channel_access_token) {
          channelAccessToken = wsSettings.channel_access_token
        }
      } catch (wsErr) {
        console.warn("Failed to fetch workspace-specific LINE token, falling back to ENV:", wsErr)
      }
    }

    // 2. Fallback to process.env.LINE_CHANNEL_ACCESS_TOKEN
    if (!channelAccessToken) {
      channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || ""
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    if (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim()) {
      return {
        success: false,
        error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token สำหรับหอพักนี้ กรุณาตั้งค่าในระบบหลังบ้านหรือหน้าจอตั้งค่าก่อน"
      }
    }

    if (!lineUserId || !lineUserId.trim()) {
      return {
        success: false,
        error: "ผู้ใช้ท่านนี้ไม่มีรหัส LINE User ID"
      }
    }

    // กำจัดช่องว่างและสแลชส่วนเกินของ App URL เพื่อป้องกันปัญหาเครื่องหมายสแลชซ้ำซ้อน (เช่น https://domain.com//portal)
    let safeAppUrl = appUrl.trim()
    while (safeAppUrl.endsWith("/")) {
      safeAppUrl = safeAppUrl.slice(0, -1)
    }
    if (!safeAppUrl.startsWith("http://") && !safeAppUrl.startsWith("https://")) {
      safeAppUrl = `https://${safeAppUrl}`
    }

    // จัดการค่าข้อความและตัวเลขทั้งหมดแบบปลอดภัย (เพื่อไม่ให้มีฟิลด์ text ว่าง "" หรือค่า NaN ซึ่งทาง LINE API จะตีว่า Request Body Invalid ทันที)
    const safeRoomNumber = roomNumber && roomNumber.trim() ? roomNumber.trim() : "-"
    const safeTenantName = tenantName && tenantName.trim() ? tenantName.trim() : "-"
    const safeBillingCycle = billingCycle && billingCycle.trim() ? billingCycle.trim() : "-"
    const safeWorkspaceName = workspaceName && workspaceName.trim() ? workspaceName.trim() : "หอพัก"

    const safeBaseRent = typeof baseRent === "number" && !isNaN(baseRent) ? baseRent : 0
    const safeElectricUnits = typeof electricUnits === "number" && !isNaN(electricUnits) ? electricUnits : 0
    const safeElectricAmount = typeof electricAmount === "number" && !isNaN(electricAmount) ? electricAmount : 0
    const safeWaterUnits = typeof waterUnits === "number" && !isNaN(waterUnits) ? waterUnits : 0
    const safeWaterAmount = typeof waterAmount === "number" && !isNaN(waterAmount) ? waterAmount : 0
    const safeCommonFee = typeof commonFee === "number" && !isNaN(commonFee) ? commonFee : 0
    const safeTotalAmount = typeof totalAmount === "number" && !isNaN(totalAmount) ? totalAmount : 0

    // สร้างลิงก์เข้าดูบิลตรงแบบไม่ต้องล็อกอิน (ระบุ workspace_id, room_id และ token ที่ป้องกัน IDOR)
    //
    // ⚠️ ตัวระบุห้องในลิงก์ต้องเป็น rooms.id ไม่ใช่เลขห้อง — หอที่มีหลายอาคารใช้เลขห้องซ้ำกันได้
    // ถ้าใช้เลขห้อง ผู้เช่าห้อง 101 ตึก A จะกดลิงก์แล้วเห็นบิลของห้อง 101 ตึก B
    // ไม่มี roomId (ผู้เรียกรุ่นเก่า) ให้ส่งลิงก์หน้า portal เปล่า ๆ ให้ผู้เช่าล็อกอินเอง ดีกว่าส่งลิงก์ที่อาจพาไปห้องผิด
    const portalRoomId = roomId && roomId.trim() ? roomId.trim() : ""
    const token = workspaceId && portalRoomId ? await generatePortalToken(workspaceId, portalRoomId) : ""
    const portalLink = workspaceId && portalRoomId
      ? `${safeAppUrl}/portal?workspace_id=${workspaceId}&room_id=${encodeURIComponent(portalRoomId)}&token=${token}`
      : `${safeAppUrl}/portal`

    // สร้างข้อความสำรองสำหรับหน้าจอแจ้งเตือน (Notification / Lock Screen)
    const altText = `🏠 ใบแจ้งค่าเช่า ห้อง ${safeRoomNumber} ยอดชำระ ${safeTotalAmount.toLocaleString()} บาท`

    // สร้าง LINE Flex Message คอนเทนต์ระดับพรีเมียม (ใช้ padding ด้วย Standard Token เช่น xl, lg แทน px เพื่อให้แสดงผลลัพธ์ได้อย่างเสถียรที่สุด)
    const flexMessageContent = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#10B981",
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "text",
            text: "ใบแจ้งค่าเช่าและบริการประจำเดือน",
            color: "#FFFFFF",
            size: "sm",
            weight: "bold"
          },
          {
            type: "text",
            text: safeWorkspaceName,
            color: "#FFFFFF",
            size: "xl",
            weight: "bold",
            margin: "sm",
            wrap: true
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "หมายเลขห้อง",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: `ห้อง ${safeRoomNumber}`,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "ผู้เช่า",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: `คุณ ${safeTenantName}`,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "รอบบิล",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: safeBillingCycle,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "separator",
            margin: "xl",
            color: "#E5E7EB"
          },
          {
            type: "box",
            layout: "vertical",
            margin: "xl",
            spacing: "md",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "🏠 ค่าเช่าห้องพัก",
                    color: "#374151",
                    size: "sm"
                  },
                  {
                    type: "text",
                    text: `${safeBaseRent.toLocaleString()} บาท`,
                    color: "#111827",
                    size: "sm",
                    weight: "bold",
                    align: "end"
                  }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: `⚡️ ค่าไฟฟ้า (${safeElectricUnits} หน่วย)`,
                    color: "#374151",
                    size: "sm"
                  },
                  {
                    type: "text",
                    text: `${safeElectricAmount.toLocaleString()} บาท`,
                    color: "#111827",
                    size: "sm",
                    weight: "bold",
                    align: "end"
                  }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: `💧 ค่าน้ำประปา (${safeWaterUnits} หน่วย)`,
                    color: "#374151",
                    size: "sm"
                  },
                  {
                    type: "text",
                    text: `${safeWaterAmount.toLocaleString()} บาท`,
                    color: "#111827",
                    size: "sm",
                    weight: "bold",
                    align: "end"
                  }
                ]
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "🏢 ค่าส่วนกลาง",
                    color: "#374151",
                    size: "sm"
                  },
                  {
                    type: "text",
                    text: `${safeCommonFee.toLocaleString()} บาท`,
                    color: "#111827",
                    size: "sm",
                    weight: "bold",
                    align: "end"
                  }
                ]
              },
              ...((extraExpenses || []).map((exp) => ({
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: `➕ ${exp.name}`,
                    color: "#374151",
                    size: "sm"
                  },
                  {
                    type: "text",
                    text: `${Number(exp.amount || 0).toLocaleString()} บาท`,
                    color: "#111827",
                    size: "sm",
                    weight: "bold",
                    align: "end"
                  }
                ]
              })))
            ]
          },
          {
            type: "separator",
            margin: "xl",
            color: "#E5E7EB"
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "xl",
            contents: [
              {
                type: "text",
                text: "ยอดชำระทั้งสิ้น",
                color: "#111827",
                size: "md",
                weight: "bold",
                gravity: "center"
              },
              {
                type: "text",
                text: `${safeTotalAmount.toLocaleString()} บาท`,
                color: "#EF4444",
                size: "xl",
                weight: "bold",
                align: "end"
              }
            ]
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingTop: "lg",
        paddingBottom: "lg",
        paddingStart: "lg",
        paddingEnd: "lg",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#10B981",
            height: "sm",
            action: {
              type: "uri",
              label: "📲 ดูบิลและสแกนจ่ายเงิน",
              uri: portalLink
            }
          }
        ]
      }
    }

    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${channelAccessToken}`
      },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        to: lineUserId.trim(),
        messages: [
          {
            type: "flex",
            altText,
            contents: flexMessageContent
          }
        ]
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("LINE Messaging API Error Response:", errorData)
      const errDetail = errorData.message || `LINE API Status Code: ${response.status}`
      return {
        success: false,
        error: `LINE API Error: ${errDetail}`
      }
    }

    return { success: true, data: "ส่งการแจ้งเตือนยอดบิลเข้าไลน์ผู้เช่าสำเร็จเรียบร้อย" }
  } catch (error) {
    console.error("sendLineBillNotificationAction Exception:", error)
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ LINE"
    return { success: false, error: errorMessage }
  }
}

export interface AppNotification {
  id: string
  type: "slip" | "overdue" | "line_oa" | "lease"
  title: string
  message: string
  link: string
  timestamp: number
  roomNumber?: string
}

export async function getNotificationsAction(selectedWorkspaceId?: string) {
  try {
    const supabase = await createClient()
    
    // 1. Get current authenticated user to identify workspace
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return { success: false, error: "ไม่ได้เข้าสู่ระบบหรือเซสชันหมดอายุ" }
    }

    let workspaceId = selectedWorkspaceId

    if (!workspaceId) {
      // 2. Get current profile to identify workspace as a fallback
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("workspace_id")
        .eq("id", user.id)
        .maybeSingle()

      if (profileError || !profile || !profile.workspace_id) {
        return { success: false, error: "ไม่พบรหัสหอพักของผู้ใช้งาน" }
      }
      workspaceId = profile.workspace_id
    }

    const notifications: AppNotification[] = []

    // ยิง query ที่เป็นอิสระต่อกัน (ไม่ต้องรอผลลัพธ์ของกันและกัน) พร้อมกันแทนการรอทีละตัวตามลำดับ
    const [roomsResult, pendingBillsQueryResult, unpaidBillsResult, lineSettingsResult, workspaceResult] = await Promise.all([
      supabase
        .from("rooms")
        .select("room_number")
        .eq("workspace_id", workspaceId),
      // ใช้ Try-Catch / Fallback เผื่อไว้กรณีผู้ใช้ยังไม่ได้รัน SQL Patch เพิ่มคอลัมน์ updated_at
      supabase
        .from("bills")
        .select("id, room_number, billing_cycle, slip_url, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending"),
      supabase
        .from("bills")
        .select("id, room_number, billing_cycle, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "unpaid"),
      supabase
        .from("workspace_line_settings")
        .select("channel_access_token")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("workspaces")
        .select("lease_expiry_action")
        .eq("id", workspaceId)
        .maybeSingle(),
    ])

    const activeRoomSet = new Set(roomsResult.data?.map((r: any) => r.room_number) || [])

    // 2. Query Bills pending verification (Slips waiting)
    let pendingBills: any[] | null = pendingBillsQueryResult.data
    let billsError = pendingBillsQueryResult.error

    if (billsError) {
      // Fallback: ถ้าหากดึง updated_at แล้ว error (เช่น ตารางยังไม่มีคอลัมน์นี้) ให้ดึงเฉพาะฟิลด์มาตรฐานเดิม
      const fallbackResult = await supabase
        .from("bills")
        .select("id, room_number, billing_cycle, slip_url, created_at")
        .eq("workspace_id", workspaceId)
        .eq("status", "pending")
      pendingBills = fallbackResult.data as any[] | null
      billsError = fallbackResult.error
    }

    if (!billsError && pendingBills) {
      pendingBills.forEach((b: any) => {
        if (!activeRoomSet.has(b.room_number)) return // skip deleted rooms
        // หากมี updated_at (เวลาผู้เช่าอัปโหลดสลิปเข้ามาล่าสุด) ให้ใช้เป็นลำดับแรกเพื่อให้เป็นแบบ Real-Time ตรงกับการโอนจริง
        const timestamp = b.updated_at 
          ? new Date(b.updated_at).getTime() 
          : (b.created_at ? new Date(b.created_at).getTime() : Date.now())

        notifications.push({
          id: `slip_${b.id}_${timestamp}`,
          type: "slip",
          title: "มีสลิปโอนเงินใหม่",
          message: `ห้อง ${b.room_number} ได้อัปโหลดสลิปสำหรับรอบบิล ${b.billing_cycle} แล้ว กรุณาตรวจสอบความถูกต้อง`,
          link: `/manage-bills?verify_bill_id=${b.id}&cycle=${b.billing_cycle}`,
          timestamp: timestamp,
          roomNumber: b.room_number
        })
      })
    }

    // 3. Query Overdue Unpaid Bills
    const { data: unpaidBills, error: unpaidError } = unpaidBillsResult

    if (!unpaidError && unpaidBills) {
      unpaidBills.forEach((b: any) => {
        if (!activeRoomSet.has(b.room_number)) return // skip deleted rooms
        const lateDays = calculateLateDays(b.billing_cycle)
        if (lateDays > 0) {
          // Calculate exact deadline time to use as timestamp for accurate "X hours/days ago" display
          const [yearStr, monthStr] = b.billing_cycle.split("-")
          const year = parseInt(yearStr, 10)
          const dueMonth = parseInt(monthStr, 10)
          const tempDueDate = new Date(Date.UTC(year, dueMonth, 5))
          const dueYearWrapped = tempDueDate.getUTCFullYear()
          const dueMonthWrapped = tempDueDate.getUTCMonth()
          const dueDateWrapped = tempDueDate.getUTCDate()
          const dueTimeUTC = Date.UTC(dueYearWrapped, dueMonthWrapped, dueDateWrapped, 16, 59, 59, 999)

          notifications.push({
            id: `overdue_${b.id}`,
            type: "overdue",
            title: "บิลค้างชำระเกินกำหนด",
            message: `ห้อง ${b.room_number} ค้างชำระค่าเช่ารอบ ${b.billing_cycle} เกินกำหนดส่งมาแล้ว ${lateDays} วัน`,
            link: "/billing",
            timestamp: dueTimeUTC,
            roomNumber: b.room_number
          })
        }
      })
    }

    // 4. Query LINE OA Settings
    const { data: lineSettings } = lineSettingsResult

    const isLineOADisconnected = !lineSettings || !lineSettings.channel_access_token || lineSettings.channel_access_token === "placeholder" || !lineSettings.channel_access_token.trim()

    if (isLineOADisconnected) {
      notifications.push({
        id: "line_oa_disconnected",
        type: "line_oa",
        title: "การเชื่อมต่อ LINE OA ขัดข้อง",
        message: "หอพักนี้ยังไม่ได้เชื่อมต่อหรือเปิดใช้งานโทเค็น LINE Messaging API กรุณาเข้าไปตั้งค่ารหัสสิทธิ์เพื่อให้ผู้เช่ารับข้อความบิลแจ้งเตือนได้",
        link: "/settings",
        timestamp: Date.now()
      })
    }

    // 5. Query Lease Expiration (Check lease expiry action)
    const { data: workspace } = workspaceResult

    const leaseExpiryAction = workspace?.lease_expiry_action || "renew"

    if (leaseExpiryAction !== "original") {
      // Query tenants near lease end date (ends within next 60 days)
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select("id, name, room_number, lease_end")
        .eq("workspace_id", workspaceId)
        .not("lease_end", "is", null)

      if (!tenantsError && tenants) {
        const now = new Date()
        now.setHours(0, 0, 0, 0)

        tenants.forEach((t: any) => {
          if (!t.lease_end) return
          if (t.room_number && !activeRoomSet.has(t.room_number)) return // skip deleted rooms

          const leaseEnd = new Date(t.lease_end)
          leaseEnd.setHours(0, 0, 0, 0)
          
          const diffTime = leaseEnd.getTime() - now.getTime()
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

          if (diffDays >= 0 && diffDays <= 60) {
            notifications.push({
              id: `lease_${t.id}`,
              type: "lease",
              title: "สัญญาเช่าใกล้หมดอายุ",
              message: `ผู้เช่าคุณ ${t.name} (ห้อง ${t.room_number || "ไม่ระบุ"}) สัญญาเช่าจะหมดในวันที่ ${t.lease_end} (เหลืออีก ${diffDays} วัน)`,
              link: "/rooms",
              timestamp: Date.now() - (60 - diffDays) * 60000
            })
          }
        })
      }
    }

    // Sort notifications by timestamp descending (newest first)
    notifications.sort((a, b) => b.timestamp - a.timestamp)

    return { success: true, data: notifications }
  } catch (error) {
    console.error("getNotificationsAction Exception:", error)
    return { success: false, error: "เกิดข้อผิดพลาดในการโหลดข้อมูลการแจ้งเตือน" }
  }
}

/**
 * ส่งข้อความแจ้งเตือนสลิปโอนเงินใหม่ไปยัง Admin (ทั้งแบบส่วนตัวและกลุ่มทีมงาน)
 */
export type SlipNotificationVariant = "new" | "success" | "warning"

const SLIP_NOTIFICATION_VARIANTS: Record<
  SlipNotificationVariant,
  { headerColor: string; headerTitle: string; altPrefix: string; buttonColor: string; buttonLabel: string }
> = {
  // ยังไม่ได้เชื่อมต่อ SlipOK (หรือปิดใช้งานอยู่) — ข้อความเดิม รอ staff ตรวจสอบเอง
  new: {
    headerColor: "#4F46E5",
    headerTitle: "📥 มีผู้เช่าอัปโหลดสลิปโอนเงินใหม่",
    altPrefix: "📥 สลิปใหม่รอตรวจ",
    buttonColor: "#4F46E5",
    buttonLabel: "🔍 ตรวจสอบสลิป & ยืนยัน"
  },
  // เชื่อมต่อ SlipOK แล้ว และตรวจสอบสลิปผ่าน (ยอดเงิน/บัญชีตรงกัน) -> ระบบปิดบิลเป็น "ชำระเงินแล้ว" ให้อัตโนมัติแล้ว
  success: {
    headerColor: "#059669",
    headerTitle: "✅ ชำระเงินแล้ว (ตรวจสอบผ่าน SlipOK อัตโนมัติ ปิดบิลให้เรียบร้อยแล้ว)",
    altPrefix: "✅ ชำระเงินแล้ว",
    buttonColor: "#059669",
    buttonLabel: "📄 ดูรายละเอียดบิล"
  },
  // เชื่อมต่อ SlipOK แล้ว แต่ตรวจสอบไม่ผ่าน (ยอดเงิน/บัญชีไม่ตรง หรือสลิปไม่ถูกต้อง)
  warning: {
    headerColor: "#DC2626",
    headerTitle: "⚠️ ตรวจสอบสลิป (SlipOK ตรวจไม่ผ่าน) กรุณาตรวจสอบด่วน",
    altPrefix: "⚠️ ตรวจสอบสลิป",
    buttonColor: "#DC2626",
    buttonLabel: "⚠️ ตรวจสอบสลิปด่วน"
  }
}

export async function sendLineSlipNotificationAction(
  billId: string,
  workspaceId: string,
  variant: SlipNotificationVariant = "new",
  slipOkReason?: string
) {
  const variantConfig = SLIP_NOTIFICATION_VARIANTS[variant]
  try {
    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let supabase = await createClient()

    // ใช้ Service Role Client ในการดึงข้อมูลบิลและค่าเซ็ตติ้ง เนื่องจากขั้นตอนนี้รันโดยผู้เช่า (Public Portal / Anon) 
    // ซึ่งจะไม่ผ่านนโยบาย RLS (Row Level Security) ทั่วไป ทำให้ดึงข้อมูลบิลเพื่อส่งไลน์แอดมินล้มเหลว
    if (url && serviceKey && !serviceKey.includes("placeholder")) {
      const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
      supabase = createSupabaseClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }) as any
    }

    // 1. ดึงข้อมูลบิล
    const { data: bill, error: billError } = await supabase
      .from("bills")
      .select("id, room_number, tenant_name, amount, billing_cycle, slip_url")
      .eq("id", billId)
      .maybeSingle()

    if (billError || !bill) {
      console.error("Error fetching bill for slip notification:", billError)
      return { success: false, error: "ไม่พบข้อมูลบิลสำหรับแจ้งเตือนสลิป" }
    }

    // 2. ดึงชื่อหอพัก
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle()
    
    const workspaceName = ws?.name || "หอพัก"

    // 3. ดึงค่าคอนฟิก LINE
    const { data: settings } = await supabase
      .from("workspace_line_settings")
      .select("channel_access_token, admin_line_user_id, admin_line_group_id, admin_notification_active, disabled_admin_line_user_ids")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const adminNotificationActive = settings?.admin_notification_active !== false

    if (!adminNotificationActive) {
      console.log("Admin LINE notification is disabled for workspace:", workspaceId)
      return { success: true, message: "ระบบแจ้งเตือนแอดมินปิดใช้งานอยู่ ข้ามกระบวนการ" }
    }

    let channelAccessToken = settings?.channel_access_token
    const adminLineUserId = settings?.admin_line_user_id
    const adminLineGroupId = settings?.admin_line_group_id
    const disabledAdminLineUserIds = settings?.disabled_admin_line_user_ids || ""

    // Fallback to process.env.LINE_CHANNEL_ACCESS_TOKEN if workspace specific is missing
    if (!channelAccessToken) {
      channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    }

    if (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim()) {
      return { success: false, error: "ไม่มี Channel Access Token ของ LINE" }
    }

    const disabledList = disabledAdminLineUserIds
      ? disabledAdminLineUserIds.split(/[\s,\n]+/).map((id: string) => id.trim()).filter((id: string) => id.length > 0)
      : []

    // แยก User ID สูงสุด 5 คน (คั่นด้วยจุลภาค, เว้นวรรค หรือขึ้นบรรทัดใหม่) และคัดกรองเฉพาะคนที่ไม่โดนปิดแจ้งเตือน
    const userIds = adminLineUserId
      ? (adminLineUserId as string)
          .split(/[\s,\n]+/)
          .map((id: string) => id.trim())
          .filter((id: string) => id.length > 0 && !disabledList.includes(id))
          .slice(0, 5)
      : []

    const hasUserId = userIds.length > 0
    const hasGroupId = adminLineGroupId && adminLineGroupId.trim()

    if (!hasUserId && !hasGroupId) {
      console.log("No admin LINE User ID or Group ID configured, skipping notification.")
      return { success: true, message: "ไม่มีการตั้งค่าแจ้งเตือนฝั่งแอดมิน ข้ามกระบวนการ" }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    let safeAppUrl = appUrl.trim()
    while (safeAppUrl.endsWith("/")) {
      safeAppUrl = safeAppUrl.slice(0, -1)
    }

    const verifyLink = `${safeAppUrl}/manage-bills?verify_bill_id=${billId}&cycle=${encodeURIComponent(bill.billing_cycle)}`

    // สร้าง Flex Message
    const altText = `${variantConfig.altPrefix}: ห้อง ${bill.room_number} ยอด ${Number(bill.amount).toLocaleString()} บาท`

    const flexMessageContent: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: variantConfig.headerColor,
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "text",
            text: variantConfig.headerTitle,
            color: "#FFFFFF",
            size: "sm",
            weight: "bold"
          },
          {
            type: "text",
            text: workspaceName,
            color: "#E0E7FF",
            size: "md",
            margin: "xs",
            weight: "bold"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "หมายเลขห้อง",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: `ห้อง ${bill.room_number}`,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "ชื่อผู้เช่า",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: bill.tenant_name,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "รอบบิล",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: bill.billing_cycle,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end"
              }
            ]
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "ยอดเงินที่แจ้งโอน",
                color: "#6B7280",
                size: "sm"
              },
              {
                type: "text",
                text: `${Number(bill.amount).toLocaleString()} บาท`,
                color: "#10B981",
                size: "md",
                weight: "bold",
                align: "end"
              }
            ]
          },
          ...(variant === "success"
            ? [
                {
                  type: "separator",
                  margin: "lg"
                },
                {
                  type: "text",
                  text: "ผลตรวจสอบอัตโนมัติ (SlipOK)",
                  color: "#059669",
                  size: "xs",
                  weight: "bold",
                  margin: "lg"
                },
                {
                  type: "text",
                  text: "✅ ยอดเงินและบัญชีผู้รับตรงกับสลิป ตรวจสอบผ่านอัตโนมัติ",
                  color: "#047857",
                  size: "sm",
                  margin: "xs",
                  wrap: true
                }
              ]
            : []),
          ...(variant === "warning"
            ? [
                {
                  type: "separator",
                  margin: "lg"
                },
                {
                  type: "text",
                  text: "ผลตรวจสอบอัตโนมัติ (SlipOK)",
                  color: "#DC2626",
                  size: "xs",
                  weight: "bold",
                  margin: "lg"
                },
                {
                  type: "text",
                  text: slipOkReason || "ตรวจสอบสลิปอัตโนมัติไม่ผ่าน กรุณาตรวจสอบด้วยตนเอง",
                  color: "#991B1B",
                  size: "sm",
                  margin: "xs",
                  wrap: true
                }
              ]
            : [])
        ]
      }
    }

    // หากมีภาพสลิปที่ส่งเข้ามา ให้นำมาแสดงเป็นภาพพรีวิวในตัว LINE Flex Message เลยเพื่อความพรีเมียม
    if (bill.slip_url && bill.slip_url.startsWith("http")) {
      flexMessageContent.hero = {
        type: "image",
        url: bill.slip_url,
        size: "full",
        aspectRatio: "3:4",
        aspectMode: "cover"
      }
    }

    // ปุ่ม Action ท้าย Flex Message
    flexMessageContent.footer = {
      type: "box",
      layout: "vertical",
      paddingTop: "md",
      paddingBottom: "md",
      paddingStart: "xl",
      paddingEnd: "xl",
      contents: [
        {
          type: "button",
          style: "primary",
          color: variantConfig.buttonColor,
          height: "sm",
          action: {
            type: "uri",
            label: variantConfig.buttonLabel,
            uri: verifyLink
          }
        }
      ]
    }

    // ฟังก์ชันยิงหาเป้าหมาย
    const sendPush = async (toTarget: string) => {
      return fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${channelAccessToken}`
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          to: toTarget.trim(),
          messages: [
            {
              type: "flex",
              altText,
              contents: flexMessageContent
            }
          ]
        })
      })
    }

    const promises = []

    if (hasUserId) {
      for (const userId of userIds) {
        console.log(`Queueing push notification to Admin Personal: ${userId}`)
        promises.push(sendPush(userId))
      }
    }

    if (hasGroupId) {
      console.log(`Queueing push notification to Admin Group: ${adminLineGroupId}`)
      promises.push(sendPush(adminLineGroupId))
    }

    const results = await Promise.all(promises)
    let anySuccess = false
    for (const res of results) {
      if (res.ok) {
        anySuccess = true
      } else {
        const errJson = await res.json().catch(() => ({}))
        console.error("Error sending push notification via LINE Messaging API:", errJson)
      }
    }

    if (anySuccess) {
      return { success: true, data: "แจ้งเตือนสลิปโอนเงินใหม่หาทีมงานนิติบุคคลสำเร็จ" }
    } else {
      return { success: false, error: "ไม่สามารถส่งข้อความแจ้งเตือนเข้าไลน์แอดมินหรือไลน์กลุ่มได้" }
    }

  } catch (error: any) {
    console.error("sendLineSlipNotificationAction Exception:", error)
    return { success: false, error: error.message }
  }
}

/**
 * ส่งข้อความแจ้งเตือน LINE ไปยัง Admin ของหอพัก เมื่อสถานะ subscription เปลี่ยน (ใกล้/ถูกจำกัดสิทธิ์)
 * เรียกใช้จาก src/app/api/cron/subscription-check/route.ts ทุกครั้งที่ workspace ถูกเปลี่ยนสถานะจริงในรอบนั้น
 */
export type SubscriptionNotificationVariant =
  | "trial_locked"
  | "past_due"
  | "payment_failed_locked"
  | "cancelled_locked"

const SUBSCRIPTION_NOTIFICATION_VARIANTS: Record<
  SubscriptionNotificationVariant,
  { headerColor: string; headerTitle: string; altPrefix: string; bodyMessage: string; buttonColor: string; buttonLabel: string }
> = {
  trial_locked: {
    headerColor: "#DC2626",
    headerTitle: "🔒 ระยะทดลองใช้งานสิ้นสุดแล้ว",
    altPrefix: "🔒 ทดลองใช้งานหมดอายุ",
    bodyMessage: "ระยะทดลองใช้งานฟรีของหอพักคุณสิ้นสุดแล้ว ระบบถูกจำกัดสิทธิ์เป็นโหมดดูข้อมูลอย่างเดียว กรุณาอัปเกรดแผนเพื่อใช้งานต่อ",
    buttonColor: "#DC2626",
    buttonLabel: "💳 อัปเกรดแผนตอนนี้"
  },
  past_due: {
    headerColor: "#D97706",
    headerTitle: "⚠️ ยังไม่ได้รับการชำระเงิน",
    altPrefix: "⚠️ ค้างชำระค่าบริการ",
    bodyMessage: "รอบบิลของหอพักคุณครบกำหนดแล้วแต่ยังไม่ได้รับการชำระเงิน กรุณาชำระก่อนถูกจำกัดสิทธิ์การใช้งาน",
    buttonColor: "#D97706",
    buttonLabel: "💳 ชำระเงินตอนนี้"
  },
  payment_failed_locked: {
    headerColor: "#DC2626",
    headerTitle: "🔒 บัญชีถูกจำกัดสิทธิ์ (ค้างชำระเกินกำหนด)",
    altPrefix: "🔒 บัญชีถูกจำกัดสิทธิ์",
    bodyMessage: "หอพักคุณค้างชำระค่าบริการเกินระยะเวลาผ่อนผันแล้ว ระบบถูกจำกัดสิทธิ์เป็นโหมดดูข้อมูลอย่างเดียว กรุณาชำระเงินเพื่อกลับมาใช้งานตามปกติ",
    buttonColor: "#DC2626",
    buttonLabel: "💳 ชำระเงินตอนนี้"
  },
  cancelled_locked: {
    headerColor: "#6B7280",
    headerTitle: "🔒 บัญชีถูกจำกัดสิทธิ์ (ยกเลิกการใช้งาน)",
    altPrefix: "🔒 บัญชีถูกจำกัดสิทธิ์",
    bodyMessage: "หอพักคุณได้ยกเลิกการใช้งานไปก่อนหน้านี้ และครบกำหนดวันหมดอายุแล้ว ระบบถูกจำกัดสิทธิ์เป็นโหมดดูข้อมูลอย่างเดียว หากต้องการใช้งานต่อ กรุณาเลือกแผนและชำระเงินอีกครั้ง",
    buttonColor: "#4F46E5",
    buttonLabel: "💳 เลือกแผนอีกครั้ง"
  }
}

export async function sendLineSubscriptionNotificationAction(
  workspaceId: string,
  variant: SubscriptionNotificationVariant
) {
  const variantConfig = SUBSCRIPTION_NOTIFICATION_VARIANTS[variant]
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let supabase = await createClient()

    // ใช้ Service Role Client เพราะฟังก์ชันนี้ถูกเรียกจาก cron job ที่ไม่มี session คุกกี้ของผู้ใช้เลย
    if (url && serviceKey && !serviceKey.includes("placeholder")) {
      const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
      supabase = createSupabaseClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }) as any
    }

    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle()

    const workspaceName = ws?.name || "หอพัก"

    const { data: settings } = await supabase
      .from("workspace_line_settings")
      .select("channel_access_token, admin_line_user_id, admin_line_group_id, admin_notification_active, disabled_admin_line_user_ids")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    const adminNotificationActive = settings?.admin_notification_active !== false

    if (!adminNotificationActive) {
      return { success: true, message: "ระบบแจ้งเตือนแอดมินปิดใช้งานอยู่ ข้ามกระบวนการ" }
    }

    let channelAccessToken = settings?.channel_access_token
    const adminLineUserId = settings?.admin_line_user_id
    const adminLineGroupId = settings?.admin_line_group_id
    const disabledAdminLineUserIds = settings?.disabled_admin_line_user_ids || ""

    if (!channelAccessToken) {
      channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    }

    if (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim()) {
      return { success: false, error: "ไม่มี Channel Access Token ของ LINE" }
    }

    const disabledList = disabledAdminLineUserIds
      ? disabledAdminLineUserIds.split(/[\s,\n]+/).map((id: string) => id.trim()).filter((id: string) => id.length > 0)
      : []

    const userIds = adminLineUserId
      ? (adminLineUserId as string)
          .split(/[\s,\n]+/)
          .map((id: string) => id.trim())
          .filter((id: string) => id.length > 0 && !disabledList.includes(id))
          .slice(0, 5)
      : []

    const hasUserId = userIds.length > 0
    const hasGroupId = adminLineGroupId && adminLineGroupId.trim()

    if (!hasUserId && !hasGroupId) {
      return { success: true, message: "ไม่มีการตั้งค่าแจ้งเตือนฝั่งแอดมิน ข้ามกระบวนการ" }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    let safeAppUrl = appUrl.trim()
    while (safeAppUrl.endsWith("/")) {
      safeAppUrl = safeAppUrl.slice(0, -1)
    }

    const packageLink = `${safeAppUrl}/settings?tab=package`
    const altText = `${variantConfig.altPrefix}: ${workspaceName}`

    const flexMessageContent: any = {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: variantConfig.headerColor,
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "text",
            text: variantConfig.headerTitle,
            color: "#FFFFFF",
            size: "sm",
            weight: "bold",
            wrap: true
          },
          {
            type: "text",
            text: workspaceName,
            color: "#E0E7FF",
            size: "md",
            margin: "xs",
            weight: "bold"
          }
        ]
      },
      body: {
        type: "box",
        layout: "vertical",
        paddingTop: "xl",
        paddingBottom: "xl",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "text",
            text: variantConfig.bodyMessage,
            color: "#374151",
            size: "sm",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingTop: "md",
        paddingBottom: "md",
        paddingStart: "xl",
        paddingEnd: "xl",
        contents: [
          {
            type: "button",
            style: "primary",
            color: variantConfig.buttonColor,
            height: "sm",
            action: {
              type: "uri",
              label: variantConfig.buttonLabel,
              uri: packageLink
            }
          }
        ]
      }
    }

    const sendPush = async (toTarget: string) => {
      return fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${channelAccessToken}`
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          to: toTarget.trim(),
          messages: [
            {
              type: "flex",
              altText,
              contents: flexMessageContent
            }
          ]
        })
      })
    }

    const promises = []

    if (hasUserId) {
      for (const userId of userIds) {
        promises.push(sendPush(userId))
      }
    }

    if (hasGroupId) {
      promises.push(sendPush(adminLineGroupId))
    }

    const results = await Promise.all(promises)
    let anySuccess = false
    for (const res of results) {
      if (res.ok) {
        anySuccess = true
      } else {
        const errJson = await res.json().catch(() => ({}))
        console.error("Error sending subscription push notification via LINE Messaging API:", errJson)
      }
    }

    if (anySuccess) {
      return { success: true, data: "แจ้งเตือนสถานะ subscription สำเร็จ" }
    } else {
      return { success: false, error: "ไม่สามารถส่งข้อความแจ้งเตือนเข้าไลน์แอดมินหรือไลน์กลุ่มได้" }
    }
  } catch (error: any) {
    console.error("sendLineSubscriptionNotificationAction Exception:", error)
    return { success: false, error: error.message }
  }
}

export interface SuperAdminLineQuota {
  limitType: string
  limit: number | null
  consumed: number
  remaining: number | null
  percentageUsed: number
  botName: string | null
  botBasicId: string | null
}

/**
 * ดึงโควต้าข้อความ LINE คงเหลือสดจาก LINE Messaging API เท่านั้น (ไม่ผ่าน cache table ใดๆ)
 * ใช้ทั้งฝั่งหน้าตั้งค่า (แสดงผล) และก่อนส่ง push จริงใน sendLineSuperAdminNotificationAction (ป้องกันยิง
 * ข้อความต่อทั้งที่โควต้าหมดแล้ว ซึ่งอาจมีค่าใช้จ่ายเพิ่มถ้าแพ็กเกจเป็นแบบเกินแล้วคิดเงิน)
 * remaining/limit เป็น null เมื่อ type = "none" หมายถึงแพ็กเกจไม่มีเพดานจำกัด
 */
export async function fetchSuperAdminLineQuota(channelAccessToken: string): Promise<SuperAdminLineQuota> {
  const headers = { Authorization: `Bearer ${channelAccessToken}` }
  const [quotaRes, consumptionRes, infoRes] = await Promise.all([
    fetch("https://api.line.me/v2/bot/message/quota", { headers, signal: AbortSignal.timeout(8000) }),
    fetch("https://api.line.me/v2/bot/message/quota/consumption", { headers, signal: AbortSignal.timeout(8000) }),
    fetch("https://api.line.me/v2/bot/info", { headers, signal: AbortSignal.timeout(8000) })
  ])

  if (!quotaRes.ok) throw new Error(`LINE API (quota) error: HTTP ${quotaRes.status}`)
  if (!consumptionRes.ok) throw new Error(`LINE API (quota/consumption) error: HTTP ${consumptionRes.status}`)

  const quotaJson = await quotaRes.json()
  const consumptionJson = await consumptionRes.json()

  const limitType: string = quotaJson.type
  const limit = limitType === "none" ? null : Number(quotaJson.value ?? 0)
  const consumed = Number(consumptionJson.totalUsage ?? 0)
  const remaining = limit === null ? null : Math.max(0, limit - consumed)
  const percentageUsed = limit && limit > 0 ? Math.round((consumed / limit) * 100) : 0

  let botName: string | null = null
  let botBasicId: string | null = null
  if (infoRes.ok) {
    const infoJson = await infoRes.json().catch(() => null)
    if (infoJson) {
      botName = infoJson.displayName || null
      botBasicId = infoJson.basicId || null
    }
  }

  return { limitType, limit, consumed, remaining, percentageUsed, botName, botBasicId }
}

/**
 * ส่งข้อความแจ้งเตือนระดับระบบ (ข้อความล้วน ไม่ใช่ flex) ไปยัง Super Admin ของ HorSet เอง
 * ผ่าน LINE ที่ตั้งค่าไว้ใน public.super_admin_line_settings (คนละตารางกับ workspace_line_settings
 * ของแต่ละหอพัก) — ใช้สำหรับเหตุการณ์ระดับระบบ เช่น หอพักสมัครใหม่, subscription ของหอพักถูกล็อกสิทธิ์,
 * หรือสลิปจ่ายเงิน subscription ตรวจสอบไม่ผ่าน ไม่เกี่ยวกับการแจ้งเตือนแอดมิน/ผู้เช่าของหอพักใดๆ
 */
export async function sendLineSuperAdminNotificationAction(message: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    let supabase = await createClient()

    // ใช้ Service Role Client เพราะฟังก์ชันนี้อาจถูกเรียกจาก cron job ที่ไม่มี session คุกกี้ของผู้ใช้เลย
    if (url && serviceKey && !serviceKey.includes("placeholder")) {
      const { createClient: createSupabaseClient } = await import("@supabase/supabase-js")
      supabase = createSupabaseClient(url, serviceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        }
      }) as unknown as typeof supabase
    }

    const { data: settings } = await supabase
      .from("super_admin_line_settings")
      .select("channel_access_token, admin_line_user_id, admin_line_group_id, notification_active, quota_exceeded_behavior")
      .eq("id", 1)
      .maybeSingle()

    if (!settings || settings.notification_active === false) {
      return { success: true, message: "ระบบแจ้งเตือน Super Admin ปิดใช้งานอยู่ ข้ามกระบวนการ" }
    }

    const channelAccessToken = settings.channel_access_token
    if (!channelAccessToken || !channelAccessToken.trim()) {
      return { success: false, error: "ยังไม่ได้ตั้งค่า LINE Channel Access Token สำหรับ Super Admin" }
    }

    // เช็คโควต้าสดก่อนยิงจริงทุกครั้ง ถ้าเหลือ 0 และเลือกโหมด "ข้ามการส่ง" (ค่า default) ไว้ ให้ปิดการแจ้งเตือน
    // อัตโนมัติแล้วข้ามการส่ง — ถ้าเลือกโหมด "ส่งต่อแม้เกินโควต้าฟรี" ไว้ ให้ปล่อยผ่านไปยิงตามปกติ (ยอมรับความเสี่ยง
    // ค่าใช้จ่ายส่วนเกินเอง ตามที่ Super Admin ตั้งใจเลือกไว้)
    const quotaExceededBehavior = settings.quota_exceeded_behavior || "skip"
    try {
      const quota = await fetchSuperAdminLineQuota(channelAccessToken)
      if (quota.remaining !== null && quota.remaining <= 0 && quotaExceededBehavior === "skip") {
        await supabase
          .from("super_admin_line_settings")
          .update({ notification_active: false, updated_at: new Date().toISOString() })
          .eq("id", 1)
        return { success: true, message: "โควต้าข้อความ LINE ของ Super Admin หมดแล้ว ระบบปิดการแจ้งเตือนอัตโนมัติเพื่อป้องกันค่าใช้จ่ายเพิ่ม" }
      }
    } catch (quotaErr) {
      // เช็คโควต้าไม่ได้ (เช่น LINE API ล่มชั่วคราว) ไม่ควรบล็อกการแจ้งเตือนทั้งหมด แค่ log แล้วส่งต่อไปตามปกติ
      console.warn("Could not verify LINE quota before sending super admin notification, proceeding anyway:", quotaErr)
    }

    const userIds = (settings.admin_line_user_id || "")
      .split(/[\s,\n]+/)
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0)
      .slice(0, 5)
    const groupId = settings.admin_line_group_id?.trim()

    if (userIds.length === 0 && !groupId) {
      return { success: true, message: "ไม่มีการตั้งค่าปลายทางแจ้งเตือนของ Super Admin ข้ามกระบวนการ" }
    }

    const sendPush = async (toTarget: string) => {
      return fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${channelAccessToken}`
        },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          to: toTarget.trim(),
          messages: [{ type: "text", text: message.slice(0, 4900) }]
        })
      })
    }

    const targets = [...userIds, ...(groupId ? [groupId] : [])]
    const results = await Promise.all(targets.map(sendPush))

    let anySuccess = false
    for (const res of results) {
      if (res.ok) {
        anySuccess = true
      } else {
        const errJson = await res.json().catch(() => ({}))
        console.error("Error sending super admin push notification via LINE Messaging API:", errJson)
      }
    }

    if (anySuccess) {
      return { success: true, data: "แจ้งเตือน Super Admin สำเร็จ" }
    } else {
      return { success: false, error: "ไม่สามารถส่งข้อความแจ้งเตือนไปยัง Super Admin ได้" }
    }
  } catch (error) {
    console.error("sendLineSuperAdminNotificationAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ" }
  }
}

/**
 * ดึงโปรไฟล์ LINE จาก User ID ที่กำหนด (รองรับหลาย ID คั่นด้วยจุลภาค เว้นวรรค หรือขึ้นบรรทัดใหม่)
 * จำกัดสูงสุด 5 คน เพื่อแสดงผลในระบบการตั้งค่าแอดมิน
 */
export async function getLineProfilesAction(userIdsStr: string, workspaceId: string) {
  try {
    if (!userIdsStr || !userIdsStr.trim() || !workspaceId) {
      return { success: true, data: [] }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()

    // ดึงค่าคอนฟิก LINE
    const { data: settings } = await supabase
      .from("workspace_line_settings")
      .select("channel_access_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    let channelAccessToken = settings?.channel_access_token
    if (!channelAccessToken) {
      channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    }

    if (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim()) {
      return { success: false, error: "ไม่มี Channel Access Token ของ LINE" }
    }

    const userIds = userIdsStr
      .split(/[\s,\n]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0)
      .slice(0, 5) // สูงสุด 5 คน

    const profiles = await Promise.all(
      userIds.map(async (userId) => {
        try {
          const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${channelAccessToken}`
            },
            signal: AbortSignal.timeout(8000)
          })

          if (res.ok) {
            const profile = await res.json()
            return {
              userId,
              displayName: profile.displayName,
              pictureUrl: profile.pictureUrl,
              statusMessage: profile.statusMessage,
              success: true
            }
          } else {
            const errBody = await res.json().catch(() => ({}))
            console.error(`Error fetching profile for user ${userId}:`, errBody)
            return {
              userId,
              displayName: "ไม่พบชื่อ (ยังไม่ได้เพิ่มเพื่อนบอท หรือ ID ไม่ถูกต้อง)",
              pictureUrl: null,
              success: false,
              error: errBody?.message || "HTTP status " + res.status
            }
          }
        } catch (err: any) {
          console.error(`Exception fetching profile for user ${userId}:`, err)
          return {
            userId,
            displayName: "ไม่สามารถเชื่อมต่อ LINE เพื่อดึงโปรไฟล์ได้",
            pictureUrl: null,
            success: false,
            error: err.message
          }
        }
      })
    )

    return { success: true, data: profiles }
  } catch (error: any) {
    console.error("getLineProfilesAction Exception:", error)
    return { success: false, error: error.message }
  }
}

/**
 * สร้างรหัสความปลอดภัย 6 หลัก สำหรับผูกข้อมูลบัญชี LINE Admin อัตโนมัติ (รหัสมีอายุ 5 นาที)
 */
export async function generateAdminConnectionCodeAction(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (Workspace ID)" }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()

    // 0. ลบรหัสเชื่อมต่อที่หมดอายุแล้วทั้งหมดออกจากระบบ
    try {
      await supabase
        .from("admin_connection_codes")
        .delete()
        .eq("workspace_id", workspaceId)
        .lt("expires_at", new Date().toISOString())
    } catch (cleanErr) {
      console.warn("Failed to clean up expired codes on generate:", cleanErr)
    }

    // 1. สร้างรหัสตัวเลขสุ่ม 6 หลัก
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 นาที

    // 2. บันทึกลงในตาราง admin_connection_codes
    const { error } = await supabase
      .from("admin_connection_codes")
      .insert({
        code,
        workspace_id: workspaceId,
        expires_at: expiresAt,
        is_used: false
      })

    if (error) {
      console.error("Error inserting admin connection code:", error)
      return { success: false, error: "ไม่สามารถสร้างรหัสเชื่อมต่อได้ กรุณาลองใหม่อีกครั้ง" }
    }

    return { success: true, code, expiresAt }
  } catch (err: any) {
    console.error("generateAdminConnectionCodeAction Exception:", err)
    return { success: false, error: err.message }
  }
}

export interface LineSettingsRow {
  channel_access_token: string | null
  liff_id: string | null
  channel_secret: string | null
  admin_line_user_id: string | null
  admin_line_group_id: string | null
  disabled_admin_line_user_ids: string | null
  admin_notification_active: boolean
  limit_count: number | null
  consumed_count: number | null
  remaining_count: number | null
  percentage_used: number | null
  bot_name: string | null
  bot_basic_id: string | null
  updated_at: string
}

/**
 * ดึงค่าตั้งค่า LINE OA ของ workspace ปัจจุบัน — read-only ไม่เช็ค feature flag
 * (ดูข้อมูลที่เคยตั้งค่าไว้ได้เสมอ แม้แผนปัจจุบันจะไม่รองรับ line_notify แล้วก็ตาม)
 */
export async function getLineSettingsAction(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_line_settings")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) throw error

    return { success: true, data: (data as LineSettingsRow | null) }
  } catch (error) {
    console.error("getLineSettingsAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลการตั้งค่า LINE OA" }
  }
}

export interface SaveLineSettingsInput {
  channelAccessToken: string
  liffId: string
  channelSecret: string
  adminLineUserId: string
  adminLineGroupId: string
  adminNotificationActive: boolean
  disabledAdminLineUserIds: string
}

/**
 * บันทึกการตั้งค่าเชื่อมต่อ LINE OA ทั้งหมด (Channel Token/Secret, LIFF, แอดมินที่รับแจ้งเตือน)
 * เช็คสิทธิ์ตามแผน (features.line_notify) ก่อนเสมอ — เป็นจุดเดียวที่ "เปิดใช้งาน" การเชื่อมต่อจริง
 */
export async function saveLineSettingsAction(workspaceId: string, input: SaveLineSettingsInput) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()

    const { data: existingRow, error: checkErr } = await supabase
      .from("workspace_line_settings")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (checkErr) throw checkErr

    const payload = {
      channel_access_token: input.channelAccessToken.trim() || null,
      liff_id: input.liffId.trim() || null,
      channel_secret: input.channelSecret.trim() || null,
      admin_line_user_id: input.adminLineUserId.trim() || null,
      admin_line_group_id: input.adminLineGroupId.trim() || null,
      admin_notification_active: input.adminNotificationActive,
      disabled_admin_line_user_ids: input.disabledAdminLineUserIds || null,
      updated_at: new Date().toISOString()
    }

    let error
    if (existingRow) {
      const { error: updateErr } = await supabase
        .from("workspace_line_settings")
        .update(payload)
        .eq("workspace_id", workspaceId)
      error = updateErr
    } else {
      const { error: insertErr } = await supabase
        .from("workspace_line_settings")
        .insert({
          workspace_id: workspaceId,
          ...payload,
          limit_count: 1000,
          consumed_count: 0,
          remaining_count: 1000,
          percentage_used: 0
        })
      error = insertErr
    }
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("saveLineSettingsAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกการตั้งค่า LINE OA" }
  }
}

/**
 * เปิด/ปิดการแจ้งเตือนแอดมินทั้งระบบของ workspace นี้ (toggle เดี่ยวๆ ไม่ผ่านฟอร์มหลัก)
 */
export async function toggleLineAdminNotificationAction(workspaceId: string, active: boolean) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()
    const { data: existingRow, error: checkErr } = await supabase
      .from("workspace_line_settings")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (checkErr) throw checkErr

    let error
    if (existingRow) {
      const { error: updateErr } = await supabase
        .from("workspace_line_settings")
        .update({ admin_notification_active: active, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
      error = updateErr
    } else {
      const { error: insertErr } = await supabase
        .from("workspace_line_settings")
        .insert({
          workspace_id: workspaceId,
          admin_notification_active: active,
          limit_count: 1000,
          consumed_count: 0,
          remaining_count: 1000,
          percentage_used: 0,
          updated_at: new Date().toISOString()
        })
      error = insertErr
    }
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("toggleLineAdminNotificationAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเปลี่ยนสถานะแจ้งเตือน" }
  }
}

/**
 * เปิด/ปิดการแจ้งเตือนของแอดมินแต่ละคน (mute รายบุคคล) — แก้เฉพาะ disabled_admin_line_user_ids
 */
export async function toggleIndividualLineAdminNotificationAction(workspaceId: string, disabledAdminLineUserIds: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()
    const { error } = await supabase
      .from("workspace_line_settings")
      .update({
        disabled_admin_line_user_ids: disabledAdminLineUserIds || null,
        updated_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("toggleIndividualLineAdminNotificationAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเปลี่ยนสถานะแจ้งเตือนรายบุคคล" }
  }
}

/**
 * ลบการเชื่อมต่อ LINE OA ทั้งหมดของ workspace นี้ (ล้าง token/secret/แอดมิน) — เป็นการ "รื้อถอน" ไม่ใช่ "ใช้งาน"
 * จึงไม่เช็ค feature flag เพื่อให้ workspace ที่แผนไม่รองรับแล้วยังล้างค่าที่ค้างอยู่เองได้เสมอ
 */
export async function deleteLineSettingsAction(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("workspace_line_settings")
      .update({
        channel_access_token: null,
        liff_id: null,
        channel_secret: null,
        admin_line_user_id: null,
        admin_line_group_id: null,
        admin_notification_active: true,
        updated_at: new Date().toISOString()
      })
      .eq("workspace_id", workspaceId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("deleteLineSettingsAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบการเชื่อมต่อ LINE OA" }
  }
}

/** ล้างเฉพาะรหัสกลุ่ม LINE ของแอดมิน — เป็นการรื้อถอน ไม่เช็ค feature flag เช่นเดียวกับ deleteLineSettingsAction */
export async function clearLineAdminGroupIdAction(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("workspace_line_settings")
      .update({ admin_line_group_id: null, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("clearLineAdminGroupIdAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการล้างรหัสกลุ่ม LINE" }
  }
}

export interface ActiveLineConnectionCode {
  code: string
  expires_at: string
}

/**
 * ดึงรายการรหัสเชื่อมต่อแอดมินที่ยังไม่หมดอายุ/ยังไม่ถูกใช้ — ลบรหัสหมดอายุ/ใช้แล้วทิ้งก่อนเสมอ (housekeeping)
 * ไม่เช็ค feature flag เพราะเป็นแค่การดูสถานะ/ทำความสะอาดตาราง ไม่ได้สร้างความสามารถใหม่
 */
export async function listActiveLineConnectionCodesAction(workspaceId: string) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    const supabase = await createClient()

    await supabase
      .from("admin_connection_codes")
      .delete()
      .eq("workspace_id", workspaceId)
      .or(`expires_at.lt.${new Date().toISOString()},is_used.eq.true`)

    const { data, error } = await supabase
      .from("admin_connection_codes")
      .select("code, expires_at")
      .eq("workspace_id", workspaceId)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })

    if (error) throw error

    return { success: true, data: (data || []) as ActiveLineConnectionCode[] }
  } catch (error) {
    console.error("listActiveLineConnectionCodesAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงรายการรหัสเชื่อมต่อ" }
  }
}

/** ยกเลิกรหัสเชื่อมต่อหนึ่งรายการด้วยตนเอง — เป็นการรื้อถอน ไม่เช็ค feature flag */
export async function deleteLineConnectionCodeAction(workspaceId: string, code: string) {
  try {
    if (!workspaceId || !code) {
      return { success: false, error: "ข้อมูลไม่ครบถ้วน" }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("admin_connection_codes")
      .delete()
      .eq("code", code)
      .eq("workspace_id", workspaceId)
    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("deleteLineConnectionCodeAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการยกเลิกรหัสเชื่อมต่อ" }
  }
}

/** ตรวจสอบว่ารหัสเชื่อมต่อถูกใช้แล้วหรือยัง (สำหรับ polling ระหว่างรอผูกบัญชีแบบอัตโนมัติ) — read-only */
export async function pollLineConnectionCodeStatusAction(workspaceId: string, code: string) {
  try {
    if (!workspaceId || !code) {
      return { success: false, error: "ข้อมูลไม่ครบถ้วน" }
    }

    const supabase = await createClient()
    const { data: codeData, error: codeErr } = await supabase
      .from("admin_connection_codes")
      .select("is_used")
      .eq("code", code)
      .maybeSingle()
    if (codeErr) throw codeErr

    if (!codeData?.is_used) {
      return { success: true, used: false as const }
    }

    const { data: wsSettings, error: wsErr } = await supabase
      .from("workspace_line_settings")
      .select("admin_line_user_id, disabled_admin_line_user_ids")
      .eq("workspace_id", workspaceId)
      .maybeSingle()
    if (wsErr) throw wsErr

    return {
      success: true,
      used: true as const,
      adminLineUserId: wsSettings?.admin_line_user_id || "",
      disabledAdminLineUserIds: wsSettings?.disabled_admin_line_user_ids || ""
    }
  } catch (error) {
    console.error("pollLineConnectionCodeStatusAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการตรวจสอบสถานะรหัสเชื่อมต่อ" }
  }
}

/**
 * ดึงโควต้าการส่งข้อความ LINE OA ปัจจุบัน (เรียก Edge Function get-line-quota ฝั่ง server)
 * เช็คสิทธิ์ตามแผนก่อนเสมอ เพราะเป็นการยิงเรียก API จริงด้วย credential ของ workspace
 */
export async function getLineQuotaAction(workspaceId: string, forceRefresh: boolean) {
  try {
    if (!workspaceId) {
      return { success: false, error: "ไม่พบรหัสหอพัก (workspace)" }
    }

    await assertWorkspaceFeatureEnabled(workspaceId, "line_notify")

    const supabase = await createClient()
    const { data, error } = await supabase.functions.invoke(
      `get-line-quota?workspace_id=${workspaceId}${forceRefresh ? "&bypass_cache=true" : ""}`,
      { method: "GET" }
    )

    if (error) throw error
    if (!data || !data.success) {
      throw new Error(data?.error || "ไม่สามารถดึงข้อมูลโควต้า LINE ได้")
    }

    return { success: true, data }
  } catch (error) {
    console.error("getLineQuotaAction Exception:", error)
    return { success: false, error: error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลโควต้า LINE" }
  }
}



