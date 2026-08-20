"use server"

import { getRooms } from "@/features/room/actions"
import { getTenants, getOldTenants } from "@/features/tenant/actions"
import { getBills } from "@/features/billing/actions"
import { getExpenses } from "@/features/expenses/actions"

export async function getDashboardData(year: string, workspaceId: string) {
  try {
    // ดึงข้อมูลทั้งหมดแบบคู่ขนาน (Parallel) บนเซิร์ฟเวอร์โดยตรง
    // ทำให้เหลือ HTTP Request จากหน้าบ้านไปยังหลังบ้านเพียงแค่ 1 ครั้งถ้วน
    const [roomsRes, tenantsRes, billsRes, expensesRes, oldTenantsRes] = await Promise.all([
      getRooms(workspaceId),
      getTenants(workspaceId),
      getBills(undefined, year, workspaceId),
      getExpenses(year, workspaceId),
      getOldTenants(workspaceId)
    ])

    return {
      success: true,
      rooms: roomsRes.success && roomsRes.data ? roomsRes.data : [],
      tenants: tenantsRes.success && tenantsRes.data ? tenantsRes.data : [],
      bills: billsRes.success && billsRes.data ? billsRes.data : [],
      expenses: expensesRes.success && expensesRes.data ? expensesRes.data : [],
      oldTenants: oldTenantsRes.success && oldTenantsRes.data ? oldTenantsRes.data : []
    }
  } catch (error: any) {
    console.error("Error in getDashboardData:", error)
    return {
      success: false,
      error: error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลแดชบอร์ดแบบรวมศูนย์"
    }
  }
}
