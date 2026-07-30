"use server"

import { createClient } from "@/lib/supabase/server"

export interface ExpenseItem {
  id: string
  title: string
  amount: number
  tax_year: string
  category: "40_5" | "40_8"
  created_at: string
  workspace_id?: string
  // ภาษีซื้อ — ดูฟีเจอร์ VAT ใน src/features/tax/ (คอลัมน์ใหม่จาก database_patch_add_vat_pp30.sql)
  vat_amount?: number
  claim_input_vat?: boolean
}

/**
 * ดึงข้อมูลค่าใช้จ่ายทั้งหมดของปีภาษีที่เลือก
 */
export async function getExpenses(taxYear?: string, workspaceId?: string) {
  try {
    const supabase = await createClient()
    let query = supabase.from("expenses").select("*")
    
    if (taxYear) {
      query = query.eq("tax_year", taxYear)
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId)
    }
    
    const { data, error } = await query.order("created_at", { ascending: false })

    if (error) throw error

    // แปลงข้อมูลและรองรับกรณีที่ไม่มีฟิลด์ category ใน DB ชั่วคราว
    const formatted: ExpenseItem[] = (data || []).map((item: any) => {
      let category: "40_5" | "40_8" = "40_5"
      let displayTitle = item.title

      if (item.category === "40_5" || item.category === "40_8") {
        category = item.category
        // ถ้ามี category อยู่แล้ว แต่ title ยังมี prefix เราอาจจะเอาออกหรือเก็บไว้ก็ได้
        if (item.title.startsWith("[40_5] ") || item.title.startsWith("[40_8] ")) {
          displayTitle = item.title.substring(7)
        }
      } else {
        // หากไม่มี category ในฐานข้อมูล ให้แกะจาก prefix ใน title
        if (item.title.startsWith("[40_5] ")) {
          category = "40_5"
          displayTitle = item.title.substring(7)
        } else if (item.title.startsWith("[40_8] ")) {
          category = "40_8"
          displayTitle = item.title.substring(7)
        } else {
          // ค่าเริ่มต้น
          category = "40_5"
        }
      }

      return {
        id: item.id,
        title: displayTitle,
        amount: Number(item.amount),
        tax_year: item.tax_year,
        category,
        created_at: item.created_at,
        workspace_id: item.workspace_id,
        vat_amount: item.vat_amount !== null && item.vat_amount !== undefined ? Number(item.vat_amount) : 0,
        claim_input_vat: item.claim_input_vat !== null && item.claim_input_vat !== undefined ? Boolean(item.claim_input_vat) : true
      }
    })

    return { success: true, data: formatted }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการดึงข้อมูลรายจ่าย"
    return { success: false, error: errorMessage }
  }
}

/**
 * บันทึกค่าใช้จ่ายใหม่
 */
export async function createExpense(title: string, amount: number, taxYear: string, category: "40_5" | "40_8", workspaceId?: string, createdAt?: string, vatAmount?: number, claimInputVat?: boolean) {
  try {
    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนบันทึกรายจ่าย (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const subscriptionWorkspaceId = workspaceId || (await getCurrentWorkspaceId())
    if (subscriptionWorkspaceId) await assertSubscriptionActive(subscriptionWorkspaceId)

    const supabase = await createClient()
    const prefixTitle = `[${category}] ${title}`

    const insertPayload: any = {
      title: prefixTitle,
      amount,
      tax_year: taxYear,
      category,
      vat_amount: vatAmount ?? 0,
      claim_input_vat: claimInputVat ?? true
    }

    if (workspaceId) {
      insertPayload.workspace_id = workspaceId
    }

    if (createdAt) {
      insertPayload.created_at = createdAt
    }

    // พยายาม insert แบบมี category + vat_amount/claim_input_vat
    const { data, error } = await supabase
      .from("expenses")
      .insert([insertPayload])
      .select()

    if (error) {
      // ตรวจสอบว่าเกิดจากไม่มีฟิลด์ category หรือ vat_amount/claim_input_vat หรือไม่ (ยังไม่ได้รัน migration)
      const isMissingColumn =
        error.message.includes("column \"category\"") ||
        error.message.includes("column \"category\" does not exist") ||
        error.message.includes("vat_amount") ||
        error.message.includes("claim_input_vat") ||
        error.code === "42703" // Postgres undefined_column code

      if (isMissingColumn) {
        const fallbackPayload: any = {
          title: prefixTitle,
          amount,
          tax_year: taxYear
        }

        if (workspaceId) {
          fallbackPayload.workspace_id = workspaceId
        }

        if (createdAt) {
          fallbackPayload.created_at = createdAt
        }

        // ลอง insert อีกครั้งโดยไม่มีฟิลด์ category/vat_amount/claim_input_vat (ใช้ prefix ใน title เพื่อระบุประเภทแทน)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("expenses")
          .insert([fallbackPayload])
          .select()

        if (fallbackError) throw fallbackError

        // จัดรูปแบบผลลัพธ์กลับไป
        const item = fallbackData[0]
        return {
          success: true,
          data: {
            id: item.id,
            title: title,
            amount: Number(item.amount),
            tax_year: item.tax_year,
            category,
            created_at: item.created_at,
            workspace_id: item.workspace_id,
            vat_amount: 0,
            claim_input_vat: true
          } as ExpenseItem
        }
      }
      throw error
    }

    const item = data[0]
    return {
      success: true,
      data: {
        id: item.id,
        title: title,
        amount: Number(item.amount),
        tax_year: item.tax_year,
        category: item.category as "40_5" | "40_8",
        created_at: item.created_at,
        workspace_id: item.workspace_id,
        vat_amount: Number(item.vat_amount ?? 0),
        claim_input_vat: Boolean(item.claim_input_vat ?? true)
      } as ExpenseItem
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการบันทึกรายจ่าย"
    return { success: false, error: errorMessage }
  }
}

/**
 * แก้ไขค่าใช้จ่าย
 */
export async function updateExpense(id: string, title: string, amount: number, taxYear: string, category: "40_5" | "40_8", createdAt?: string, vatAmount?: number, claimInputVat?: boolean) {
  try {
    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนแก้ไขรายจ่าย (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const subscriptionWorkspaceId = await getCurrentWorkspaceId()
    if (subscriptionWorkspaceId) await assertSubscriptionActive(subscriptionWorkspaceId)

    const supabase = await createClient()
    const prefixTitle = `[${category}] ${title}`

    const updatePayload: any = {
      title: prefixTitle,
      amount,
      tax_year: taxYear,
      category,
      vat_amount: vatAmount ?? 0,
      claim_input_vat: claimInputVat ?? true
    }

    if (createdAt) {
      updatePayload.created_at = createdAt
    }

    // พยายามอัปเดตแบบมี category + vat_amount/claim_input_vat
    const { data, error } = await supabase
      .from("expenses")
      .update(updatePayload)
      .eq("id", id)
      .select()

    if (error) {
      const isMissingColumn =
        error.message.includes("column \"category\"") ||
        error.message.includes("column \"category\" does not exist") ||
        error.message.includes("vat_amount") ||
        error.message.includes("claim_input_vat") ||
        error.code === "42703"

      if (isMissingColumn) {
        const fallbackPayload: any = {
          title: prefixTitle,
          amount,
          tax_year: taxYear
        }

        if (createdAt) {
          fallbackPayload.created_at = createdAt
        }

        // อัปเดตแบบไม่มี category/vat_amount/claim_input_vat (ใช้ prefix ใน title)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("expenses")
          .update(fallbackPayload)
          .eq("id", id)
          .select()

        if (fallbackError) throw fallbackError

        const item = fallbackData[0]
        return {
          success: true,
          data: {
            id: item.id,
            title: title,
            amount: Number(item.amount),
            tax_year: item.tax_year,
            category,
            created_at: item.created_at,
            workspace_id: item.workspace_id,
            vat_amount: 0,
            claim_input_vat: true
          } as ExpenseItem
        }
      }
      throw error
    }

    const item = data[0]
    return {
      success: true,
      data: {
        id: item.id,
        title: title,
        amount: Number(item.amount),
        tax_year: item.tax_year,
        category: item.category as "40_5" | "40_8",
        created_at: item.created_at,
        workspace_id: item.workspace_id,
        vat_amount: Number(item.vat_amount ?? 0),
        claim_input_vat: Boolean(item.claim_input_vat ?? true)
      } as ExpenseItem
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการแก้ไขรายจ่าย"
    return { success: false, error: errorMessage }
  }
}

/**
 * ลบค่าใช้จ่าย
 */
export async function deleteExpense(id: string) {
  try {
    // ตรวจสอบสิทธิ์การใช้งาน subscription ของ workspace ก่อนลบรายจ่าย (บล็อกถ้า read_only/cancelled)
    const { assertSubscriptionActive, getCurrentWorkspaceId } = await import("@/features/subscription/actions")
    const subscriptionWorkspaceId = await getCurrentWorkspaceId()
    if (subscriptionWorkspaceId) await assertSubscriptionActive(subscriptionWorkspaceId)

    const supabase = await createClient()
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", id)

    if (error) throw error
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการลบรายจ่าย"
    return { success: false, error: errorMessage }
  }
}
