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
}

/**
 * ดึงข้อมูลค่าใช้จ่ายทั้งหมดของปีภาษีที่เลือก
 */
export async function getExpenses(taxYear?: string) {
  try {
    const supabase = await createClient()
    let query = supabase.from("expenses").select("*")
    
    if (taxYear) {
      query = query.eq("tax_year", taxYear)
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
        workspace_id: item.workspace_id
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
export async function createExpense(title: string, amount: number, taxYear: string, category: "40_5" | "40_8") {
  try {
    const supabase = await createClient()
    const prefixTitle = `[${category}] ${title}`

    // พยายาม insert แบบมี category
    const { data, error } = await supabase
      .from("expenses")
      .insert([
        {
          title: prefixTitle,
          amount,
          tax_year: taxYear,
          category
        }
      ])
      .select()

    if (error) {
      // ตรวจสอบว่าเกิดจากไม่มีฟิลด์ category หรือไม่
      const isMissingColumn = 
        error.message.includes("column \"category\"") || 
        error.message.includes("column \"category\" does not exist") ||
        error.code === "42703" // Postgres undefined_column code

      if (isMissingColumn) {
        // ลอง insert อีกครั้งโดยไม่มีฟิลด์ category (ใช้ prefix ใน title เพื่อระบุประเภทแทน)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("expenses")
          .insert([
            {
              title: prefixTitle,
              amount,
              tax_year: taxYear
            }
          ])
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
            workspace_id: item.workspace_id
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
        workspace_id: item.workspace_id
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
export async function updateExpense(id: string, title: string, amount: number, taxYear: string, category: "40_5" | "40_8") {
  try {
    const supabase = await createClient()
    const prefixTitle = `[${category}] ${title}`

    // พยายามอัปเดตแบบมี category
    const { data, error } = await supabase
      .from("expenses")
      .update({
        title: prefixTitle,
        amount,
        tax_year: taxYear,
        category
      })
      .eq("id", id)
      .select()

    if (error) {
      const isMissingColumn = 
        error.message.includes("column \"category\"") || 
        error.message.includes("column \"category\" does not exist") ||
        error.code === "42703"

      if (isMissingColumn) {
        // อัปเดตแบบไม่มี category (ใช้ prefix ใน title)
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("expenses")
          .update({
            title: prefixTitle,
            amount,
            tax_year: taxYear
          })
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
            workspace_id: item.workspace_id
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
        workspace_id: item.workspace_id
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
