import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({
    request,
  })

  // ดึงค่า role จากคุกกี้ที่ใช้ในระบบจำลอง (mock auth)
  const mockRole = request.cookies.get("horset_user_role")?.value
  const path = request.nextUrl.pathname

  // รายการเส้นทางแต่ละสิทธิ์ในระเบบ (ตาม Next.js Route Groups ใน src/app)
  const adminPaths = ["/dashboard", "/tax"]
  const sharedPaths = ["/rooms", "/tenants"]
  const staffPaths = ["/meter", "/billing"]
  const tenantPaths = ["/portal"]

  // ตรวจสอบความถูกต้องของเส้นทางกับสิทธิ์ผู้ใช้งาน
  if (adminPaths.includes(path) && mockRole !== "admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (sharedPaths.includes(path) && mockRole !== "admin" && mockRole !== "staff") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (staffPaths.includes(path) && mockRole !== "staff" && mockRole !== "admin") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  if (tenantPaths.includes(path) && mockRole !== "tenant") {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  // หากผู้ใช้อยู่ที่หน้า login แต่ล็อกอินแล้ว ให้นำทางไปแดชบอร์ดตามสิทธิ์ที่มี
  if (path === "/login" && mockRole) {
    const url = request.nextUrl.clone()
    if (mockRole === "admin") {
      url.pathname = "/dashboard"
      return NextResponse.redirect(url)
    } else if (mockRole === "staff") {
      url.pathname = "/meter"
      return NextResponse.redirect(url)
    } else if (mockRole === "tenant") {
      url.pathname = "/portal"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

