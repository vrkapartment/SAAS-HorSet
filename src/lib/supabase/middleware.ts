import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  })

  // ดึงค่า role จากคุกกี้ที่ใช้ในระบบจำลอง (mock auth)
  const mockRole = request.cookies.get("horset_user_role")?.value
  const path = request.nextUrl.pathname

  // รายการเส้นทางแต่ละสิทธิ์ในระบบ (ตาม Next.js Route Groups ใน src/app)
  const superAdminPaths = ["/super-admin"]
  const adminPaths = ["/dashboard", "/tax", "/daily-bills", "/finance-settings", "/test-connection"]
  const sharedPaths = ["/rooms", "/tenants"]
  const staffPaths = ["/meter", "/billing", "/manage-bills"]
  const tenantPaths = ["/portal"]

  // ตรวจสอบความถูกต้องของเส้นทางกับสิทธิ์ผู้ใช้งาน
  // ใช้ startsWith สำหรับ super-admin เพื่อครอบคลุมหน้าย่อยด้วย (เช่น /super-admin/plans)
  if (superAdminPaths.some((p) => path === p || path.startsWith(`${p}/`)) && mockRole !== "super_admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (adminPaths.includes(path) && mockRole !== "admin" && mockRole !== "super_admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (sharedPaths.includes(path) && mockRole !== "admin" && mockRole !== "staff" && mockRole !== "super_admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (staffPaths.includes(path) && mockRole !== "staff" && mockRole !== "admin" && mockRole !== "super_admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (tenantPaths.includes(path) && mockRole !== "tenant") {
    // อนุญาตให้ผู้เช่าเข้าหน้า /portal ได้โดยไม่ต้อง Login หากเข้าผ่านลิงก์ตรงจากไลน์
    // (มี workspace_id + ตัวระบุห้อง + token ที่เซ็นไว้)
    //
    // ⚠️ ต้องรับ "ทั้งสองชื่อ" ของตัวระบุห้อง:
    //   room_id     = ลิงก์รูปแบบปัจจุบัน (rooms.id) — ทุกลิงก์ที่ระบบออกให้ตั้งแต่ patch room_id
    //   room_number = ลิงก์รูปแบบเก่าที่ยังค้างอยู่ใน LINE ของผู้เช่า
    //
    // ถ้าเช็คแค่ชื่อเดียว ลิงก์อีกแบบจะถูกเด้งไปหน้า login ทั้งหมด ซึ่งเท่ากับผู้เช่าเปิดบิลไม่ได้เลย
    // (เคยเกิดขึ้นจริงตอน deploy patch room_id — ลิงก์เปลี่ยนเป็น room_id แต่ที่นี่ยังเช็ค room_number)
    const workspaceId = request.nextUrl.searchParams.get("workspace_id")
    const roomId = request.nextUrl.searchParams.get("room_id")
    const roomNumber = request.nextUrl.searchParams.get("room_number")
    const token = request.nextUrl.searchParams.get("token")
    const isLoginFreePortal = Boolean(workspaceId && token && (roomId || roomNumber))

    if (!isLoginFreePortal) {
      const url = request.nextUrl.clone()
      url.pathname = "/login"
      return NextResponse.redirect(url)
    }
  }

  // หากผู้ใช้อยู่ที่หน้า login แต่ล็อกอินแล้ว ให้นำทางไปแดชบอร์ดตามสิทธิ์ที่มี
  if (path === "/login" && mockRole) {
    const url = request.nextUrl.clone()
    if (mockRole === "super_admin") {
      url.pathname = "/super-admin"
      return NextResponse.redirect(url)
    } else if (mockRole === "admin") {
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    } else if (mockRole === "staff") {
      // หน้าแรกของ staff คนนี้ที่ Admin กำหนดไว้เฉพาะคน (ตั้งไว้เป็นคุกกี้ตอน login) ถ้าไม่มีใช้ /billing เป็นค่าเริ่มต้น
      const staffLandingPage = request.cookies.get("horset_staff_landing_page")?.value
      url.pathname = staffLandingPage || "/billing"
      return NextResponse.redirect(url)
    } else if (mockRole === "tenant") {
      url.pathname = "/portal"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

