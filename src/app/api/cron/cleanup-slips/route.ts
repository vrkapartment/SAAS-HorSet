import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    // 1. ตรวจสอบความปลอดภัยด้วย CRON_SECRET เพื่อป้องกันการยิงเข้ามารันสคริปต์โดยไม่ได้รับอนุญาต
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get("authorization")
    const { searchParams } = new URL(request.url)
    const paramSecret = searchParams.get("secret")

    if (cronSecret) {
      const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null
      if (token !== cronSecret && paramSecret !== cronSecret) {
        return NextResponse.json(
          { success: false, error: "สิทธิ์การเข้าถึงไม่ถูกต้อง (Unauthorized)" },
          { status: 401 }
        )
      }
    } else {
      console.warn("⚠️ CRON_SECRET is not configured. Running cron job without secret verification.")
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey || serviceKey.includes("placeholder")) {
      return NextResponse.json(
        { success: false, error: "ระบบฐานข้อมูลหรือคีย์เชื่อมต่อเซิร์ฟเวอร์ไม่พร้อมใช้งาน" },
        { status: 500 }
      )
    }

    // สร้าง Supabase Admin Client ด้วย Service Role Key เพื่อก้าวข้าม Row-Level Security
    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 2. ดึงข้อมูลอพาร์ทเมนท์ (Workspaces) ทั้งหมดที่มีการตั้งค่าระยะเวลาเก็บสลิป (slip_retention_months > 0)
    const { data: workspaces, error: wsError } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, slip_retention_months")
      .gt("slip_retention_months", 0)

    if (wsError) {
      console.error("Error fetching workspaces for cleanup:", wsError)
      return NextResponse.json(
        { success: false, error: `เกิดข้อผิดพลาดในการดึงข้อมูลอพาร์ทเมนท์: ${wsError.message}` },
        { status: 500 }
      )
    }

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({
        success: true,
        message: "ไม่มีอพาร์ทเมนท์ใดที่ตั้งค่าลบไฟล์สลิปอัตโนมัติในขณะนี้",
        processed_workspaces: 0,
        details: []
      })
    }

    const details = []
    let totalWorkspacesProcessed = 0
    let totalFilesDeleted = 0

    // 3. วนลูปดำเนินการลบไฟล์ทีละอพาร์ทเมนท์ เพื่อความปลอดภัยและความเสถียร (Try-Catch แยกรายตัว)
    for (const ws of workspaces) {
      try {
        const retentionMonths = Number(ws.slip_retention_months || 0)
        if (retentionMonths <= 0) continue

        // คำนวณวันหมดอายุตามเวลาปัจจุบัน: วันที่อัปโหลดสลิป (created_at) < วันปัจจุบันย้อนหลังไป N เดือน
        const cutoffDate = new Date()
        cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths)
        const cutoffIso = cutoffDate.toISOString()

        // ค้นหารายการบิลของอพาร์ทเมนท์นี้ที่หมดอายุ
        const { data: expiredBills, error: billsError } = await supabaseAdmin
          .from("bills")
          .select("id, slip_url")
          .eq("workspace_id", ws.id)
          .not("slip_url", "is", null)
          .lt("created_at", cutoffIso)

        if (billsError) {
          console.error(`Error fetching bills for workspace ${ws.name} (${ws.id}):`, billsError)
          details.push({
            workspace_id: ws.id,
            name: ws.name,
            success: false,
            error: `ล้มเหลวในการดึงข้อมูลบิล: ${billsError.message}`
          })
          continue
        }

        if (!expiredBills || expiredBills.length === 0) {
          details.push({
            workspace_id: ws.id,
            name: ws.name,
            success: true,
            retention_months: retentionMonths,
            expired_found: 0,
            deleted_count: 0,
            message: "ไม่มีรูปภาพสลิปที่หมดอายุ"
          })
          totalWorkspacesProcessed++
          continue
        }

        // กรองหา Storage Path เพื่อลบใน Bucket 'payment-slips'
        const pathsToDelete: string[] = []
        const billIdsToUpdate: string[] = []

        for (const bill of expiredBills) {
          if (bill.slip_url) {
            const marker = "/payment-slips/"
            const idx = bill.slip_url.indexOf(marker)
            if (idx !== -1) {
              const path = bill.slip_url.substring(idx + marker.length)
              if (path) {
                pathsToDelete.push(path)
                billIdsToUpdate.push(bill.id)
              }
            }
          }
        }

        let deletedCount = 0

        if (pathsToDelete.length > 0) {
          // ดำเนินการลบไฟล์จาก Bucket ใน Storage (ลบเป็น Batch)
          const { data: deleteData, error: deleteStorageError } = await supabaseAdmin
            .storage
            .from("payment-slips")
            .remove(pathsToDelete)

          if (deleteStorageError) {
            console.error(`Error deleting storage slips for workspace ${ws.name}:`, deleteStorageError)
          } else if (deleteData) {
            deletedCount = deleteData.length
            totalFilesDeleted += deletedCount
          }

          // อัปเดตฟิลด์ slip_url เป็น NULL ในตาราง bills สำหรับรายการที่ถูกลบไปแล้ว
          const { error: dbUpdateError } = await supabaseAdmin
            .from("bills")
            .update({ slip_url: null })
            .in("id", billIdsToUpdate)

          if (dbUpdateError) {
            console.error(`Error updating bills database for workspace ${ws.name}:`, dbUpdateError)
          }
        }

        details.push({
          workspace_id: ws.id,
          name: ws.name,
          success: true,
          retention_months: retentionMonths,
          expired_found: expiredBills.length,
          deleted_count: deletedCount,
          message: `ลบสลิปสำเร็จจำนวน ${deletedCount} รูปภาพ`
        })
        totalWorkspacesProcessed++

      } catch (wsErr: unknown) {
        console.error(`Unexpected error processing workspace ${ws.name} (${ws.id}):`, wsErr)
        details.push({
          workspace_id: ws.id,
          name: ws.name,
          success: false,
          error: wsErr instanceof Error ? wsErr.message : "เกิดข้อผิดพลาดที่ไม่รู้จัก"
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "ระบบดำเนินการตรวจเช็กและล้างไฟล์สลิปหมดอายุประจำงวดเรียบร้อยแล้ว!",
      processed_workspaces: totalWorkspacesProcessed,
      total_files_deleted: totalFilesDeleted,
      details
    })

  } catch (err: unknown) {
    console.error("Cron Job Error:", err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการประมวลผลระบบอัตโนมัติ" },
      { status: 500 }
    )
  }
}
