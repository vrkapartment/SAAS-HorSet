"use server"

import { createClient } from "@/lib/supabase/server"
import { generatePortalToken } from "@/features/tenant/actions"

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
    } = payload

    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    if (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim()) {
      return {
        success: false,
        error: "ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ของจริงในระบบหลังบ้าน (.env)"
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

