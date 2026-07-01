"use server"

import { createClient } from "@/lib/supabase/server"
import { generatePortalToken } from "@/features/tenant/actions"
import { calculateLateDays } from "@/features/billing/utils"

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

    // สร้างลิงก์เข้าดูบิลตรงแบบไม่ต้องล็อกอิน (โดยระบุ workspace_id, room_number และ token ที่มีความปลอดภัยป้องกัน IDOR)
    const token = workspaceId ? await generatePortalToken(workspaceId, safeRoomNumber) : ""
    const portalLink = workspaceId
      ? `${safeAppUrl}/portal?workspace_id=${workspaceId}&room_number=${encodeURIComponent(safeRoomNumber)}&token=${token}`
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

    // 2. Query Bills pending verification (Slips waiting)
    // ใช้ Try-Catch / Fallback เผื่อไว้กรณีผู้ใช้ยังไม่ได้รัน SQL Patch เพิ่มคอลัมน์ updated_at
    let pendingBillsResult = await supabase
      .from("bills")
      .select("id, room_number, billing_cycle, slip_url, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")

    let pendingBills: any[] | null = pendingBillsResult.data
    let billsError = pendingBillsResult.error

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
    const { data: unpaidBills, error: unpaidError } = await supabase
      .from("bills")
      .select("id, room_number, billing_cycle, created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "unpaid")

    if (!unpaidError && unpaidBills) {
      unpaidBills.forEach((b: any) => {
        const lateDays = calculateLateDays(b.billing_cycle)
        if (lateDays > 0) {
          notifications.push({
            id: `overdue_${b.id}`,
            type: "overdue",
            title: "บิลค้างชำระเกินกำหนด",
            message: `ห้อง ${b.room_number} ค้างชำระค่าเช่ารอบ ${b.billing_cycle} เกินกำหนดส่งมาแล้ว ${lateDays} วัน`,
            link: "/billing",
            timestamp: b.created_at ? new Date(b.created_at).getTime() : Date.now(),
            roomNumber: b.room_number
          })
        }
      })
    }

    // 4. Query LINE OA Settings
    const { data: lineSettings, error: lineError } = await supabase
      .from("workspace_line_settings")
      .select("channel_access_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

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
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("lease_expiry_action")
      .eq("id", workspaceId)
      .maybeSingle()

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


