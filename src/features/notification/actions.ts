"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * ฟังก์ชันจำลองสำหรับระบบส่งข้อความแจ้งเตือนผ่าน LINE Messaging API
 */
export async function sendNotificationPlaceholder() {
  try {
    const supabase = await createClient()
    
    // TODO: พัฒนาระบบยิง API แจ้งเตือนบิลพร้อมแนบลิงก์การชำระเงินไปยังผู้เช่าในอนาคต
    
    return { success: true, data: "ส่งการแจ้งเตือน LINE สำเร็จ (ตัวอย่าง)" }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"
    return { success: false, error: errorMessage }
  }
}
