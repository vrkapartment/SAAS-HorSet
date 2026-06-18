"use server"

import { createClient } from "@/lib/supabase/server"

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
  totalAmount: number
  workspaceName: string
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
      totalAmount,
      workspaceName,
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

    // สร้างข้อความรายละเอียดค่าใช้จ่ายที่อ่านง่าย สะอาดตา และเป็นระเบียบ
    const messageText = `🏠 แจ้งยอดค่าเช่าและบริการประจำ${billingCycle}
━━━━━━━━━━━━━━━━━━━━
🏢 หอพัก: ${workspaceName}
🚪 ห้องพัก: ห้อง ${roomNumber}
👤 ผู้เช่า: คุณ ${tenantName}

รายการค่าใช้จ่ายประจำเดือน:
• ค่าเช่าห้องพัก: ${baseRent.toLocaleString()} บาท
• ค่าไฟฟ้า (${electricUnits} หน่วย): ${electricAmount.toLocaleString()} บาท
• ค่าน้ำประปา (${waterUnits} หน่วย): ${waterAmount.toLocaleString()} บาท

💰 ยอดรวมทั้งสิ้นที่ต้องชำระ: ${totalAmount.toLocaleString()} บาท
━━━━━━━━━━━━━━━━━━━━
* คุณสามารถสแกน PromptPay QR Code, แนบสลิปโอนเงิน และดูบิลฉบับเต็มได้ทันทีที่ Tenant Portal:
🔗 ${appUrl}/portal`

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
            type: "text",
            text: messageText
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

