"use client"

import { useState, useEffect, Suspense } from "react"
import Script from "next/script"
import { Sparkles, MessageSquare, Phone, Home, Loader2, CheckCircle2, AlertCircle, User, Building, ChevronRight } from "lucide-react"
import { unpackWorkspaceAndRoom } from "@/lib/urlPacker"
import { getLiffUrlParam } from "@/lib/liffUrlParams"
import { DEFAULT_BOT_BASIC_ID, DEFAULT_BOT_DISPLAY_NAME, DEFAULT_LIFF_ID } from "@/lib/lineLiff"
import {
  buildPortalUrl,
  normalizePortalAction,
  type PortalResolveResponse,
  type PortalRoomOption
} from "@/lib/portalLiff"

/**
 * หน้านี้รับสองหน้าที่ เพราะเป็น LIFF Endpoint URL ของ channel
 *
 *   1. ค่าเริ่มต้น — ฟอร์มลงทะเบียนผู้เช่า (ผูก LINE UID เข้ากับห้อง) ตามลิงก์ที่แอดมินส่งให้
 *   2. `?to=portal` — ตัวจ่ายงานของ rich menu: หาห้องของผู้เช่าแล้วเด้งไปหน้า /portal
 *
 * ที่ต้องอยู่หน้าเดียวกันเพราะ LIFF บังคับว่าหน้าที่เรียก liff.login() ต้องอยู่ใต้ Endpoint URL
 * ที่ตั้งไว้ใน LINE Developers Console เท่านั้น ถ้าแยกเป็นอีก route ผู้เช่าจะ login ไม่ผ่าน
 * (ปลายทาง /portal ไม่ติดกฎนี้ เพราะยืนยันตัวตนด้วย signed token ไม่ได้ใช้ LIFF)
 */

/** สถานะพิเศษของโหมด rich menu — null คือแสดงฟอร์มลงทะเบียนตามปกติ */
type PortalView =
  | { kind: "redirecting" }
  | { kind: "choose"; rooms: { room: PortalRoomOption; url: string }[] }
  | { kind: "not_registered" }
  | { kind: "error"; message: string }

/** จอของโหมด rich menu (เลือกห้อง / ยังไม่ลงทะเบียน / ผิดพลาด) — ใช้ดีไซน์เดียวกับฟอร์มลงทะเบียน */
function PortalStateCard({ view }: { view: Exclude<PortalView, { kind: "redirecting" }> }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[320px] h-[320px] bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[90px] pointer-events-none" />

      <div className="w-full max-w-md z-10">
        <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl shadow-emerald-950/5 space-y-6">
          {view.kind === "choose" && (
            <>
              <div className="space-y-1.5">
                <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                  <Building className="w-5 h-5 text-emerald-400" />
                  เลือกห้องที่ต้องการดู
                </h2>
                <p className="text-xs text-slate-400 font-semibold">
                  บัญชี LINE ของคุณผูกไว้กับ {view.rooms.length} ห้อง กรุณาเลือกห้องที่ต้องการ
                </p>
              </div>

              <div className="space-y-2.5">
                {view.rooms.map(({ room, url }) => (
                  <a
                    key={`${room.workspaceId}:${room.roomId}`}
                    href={url}
                    className="flex items-center justify-between gap-3 p-4 bg-slate-950/50 border border-slate-900/80 rounded-2xl hover:border-emerald-500/50 transition-colors active:scale-[0.99]"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-bold text-slate-100 truncate">ห้อง {room.roomNumber}</p>
                      <p className="text-[11px] text-slate-400 truncate">{room.workspaceName}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  </a>
                ))}
              </div>
            </>
          )}

          {view.kind === "not_registered" && (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                <MessageSquare className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-100">ยังไม่พบห้องพักที่ผูกกับบัญชี LINE นี้</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  บัญชี LINE ที่คุณใช้อยู่ยังไม่ได้ลงทะเบียนเป็นผู้เช่าในระบบ
                  กรุณาขอ &quot;ลิงก์ลงทะเบียนผู้เช่า&quot; จากผู้ดูแลหอพัก
                  เนื่องจากลิงก์ลงทะเบียนต้องระบุห้องพักของคุณมาด้วย
                </p>
              </div>
            </div>
          )}

          {view.kind === "error" && (
            <div className="text-center space-y-5">
              <div className="inline-flex items-center justify-center p-4 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20">
                <AlertCircle className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-slate-100">เปิดหน้าบิลไม่สำเร็จ</h2>
                <p className="text-xs text-slate-400 leading-relaxed">{view.message}</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-colors active:scale-[0.98]"
              >
                ลองใหม่อีกครั้ง
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TenantRegisterContent() {
  const [liffLoaded, setLiffLoaded] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [lineUserId, setLineUserId] = useState("")
  const [workspaceId, setWorkspaceId] = useState("")
  const [roomId, setRoomId] = useState("")
  const [roomNumber, setRoomNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [pageInitializing, setPageInitializing] = useState(true)
  const [botBasicId, setBotBasicId] = useState(DEFAULT_BOT_BASIC_ID)
  const [botDisplayName, setBotDisplayName] = useState(DEFAULT_BOT_DISPLAY_NAME)
  const [portalView, setPortalView] = useState<PortalView | null>(null)

  // ฟังก์ชันล้างเบอร์โทรศัพท์ให้อยู่ในฟอร์แมตตัวเลข 10 หลัก
  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 10)
    setPhone(clean)
  }

  // ดักจับพารามิเตอร์จาก URL/liff.state (ดู src/lib/liffUrlParams.ts)
  const getUrlParam = getLiffUrlParam

  const initLiff = async () => {
    if (liffLoaded) return
    if ((window as any).__liffInitializing) return
    (window as any).__liffInitializing = true

    try {
      const liff = (window as any).liff
      if (!liff) {
        (window as any).__liffInitializing = false
        return
      }

      // ดักจับค่าและเซ็ตพารามิเตอร์ที่ส่งมาจากลิงก์แอดมินก่อน เพื่อหา liff_id ไดนามิก
      let wsId = getUrlParam("workspace_id")
      let rId = getUrlParam("room_id")
      let rNum = getUrlParam("room_number")

      const packed = getUrlParam("p")
      if (packed) {
        const unpacked = unpackWorkspaceAndRoom(packed)
        if (unpacked) {
          wsId = unpacked.workspaceId
          rId = unpacked.roomId
        }
      }

      setWorkspaceId(wsId)
      setRoomId(rId)
      setRoomNumber(rNum)

      // เรียกดึง LIFF ID ที่ถูกต้องจากตารางฐานข้อมูลแยกราย Workspace
      const defaultLiffId = DEFAULT_LIFF_ID
      let activeLiffId = defaultLiffId // default fallback
      
      if (wsId) {
        try {
          const liffRes = await fetch(`/api/workspace-liff?workspace_id=${wsId}`)
          const liffData = await liffRes.json()
          if (liffData.success) {
            if (liffData.liffId) {
              activeLiffId = liffData.liffId
            }
            if (liffData.botBasicId) {
              setBotBasicId(liffData.botBasicId)
            }
            if (liffData.botDisplayName) {
              setBotDisplayName(liffData.botDisplayName)
            }
          }
        } catch (fetchErr) {
          console.error("Failed to fetch dynamic liffId, using fallback:", fetchErr)
        }
      }

      // พยายาม Initialize LIFF ด้วย ID ที่ตั้งค่าไว้
      try {
        console.log(`Initializing LIFF with ID: ${activeLiffId}`)
        await liff.init({ liffId: activeLiffId })
      } catch (initErr) {
        console.error(`Failed to init LIFF with custom ID ${activeLiffId}:`, initErr)
        
        // หากล้มเหลวและไม่ได้ใช้ ID หลักอยู่แล้ว ให้ถอยกลับมาใช้ ID หลัก (Self-Healing)
        if (activeLiffId !== defaultLiffId) {
          console.log(`Self-Healing: Retrying LIFF init with default fallback ID: ${defaultLiffId}`)
          await liff.init({ liffId: defaultLiffId })
        } else {
          throw initErr // ถ้าขนาด ID หลักยังพัง ให้โยนข้ามไปตัวนอกสุด
        }
      }

      setLiffLoaded(true)

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const userProfile = await liff.getProfile()
      setProfile(userProfile)
      setLineUserId(userProfile.userId)

      // โหมด rich menu — ไม่ต้องลงทะเบียน แค่หาห้องของผู้เช่าแล้วเด้งไปหน้าบิล
      if (getUrlParam("to") === "portal") {
        const requestedAction = normalizePortalAction(getUrlParam("action"))
        const accessToken = liff.getAccessToken()

        if (!accessToken) {
          setPortalView({
            kind: "error",
            message: "ไม่สามารถยืนยันตัวตนกับ LINE ได้ กรุณาปิดหน้านี้แล้วกดปุ่มในเมนูใหม่อีกครั้ง"
          })
          return
        }

        const resolveRes = await fetch("/api/portal-resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: wsId, accessToken })
        })
        const resolveData = (await resolveRes.json()) as PortalResolveResponse

        if (!resolveData?.success) {
          setPortalView({
            kind: "error",
            message: resolveData?.error || "ไม่สามารถตรวจสอบข้อมูลผู้เช่าได้ กรุณาลองใหม่อีกครั้ง"
          })
          return
        }

        if (resolveData.status === "resolved" && resolveData.room) {
          // คงจอโหลดไว้จนกว่าจะย้ายหน้าเสร็จ ไม่ให้ฟอร์มลงทะเบียนแวบขึ้นมาให้เห็น
          setPortalView({ kind: "redirecting" })
          window.location.replace(buildPortalUrl(resolveData.room, requestedAction))
          return
        }

        if (resolveData.status === "multiple" && Array.isArray(resolveData.rooms)) {
          setPortalView({
            kind: "choose",
            rooms: resolveData.rooms.map(room => ({
              room,
              url: buildPortalUrl(room, requestedAction)
            }))
          })
          return
        }

        // ยังไม่เคยลงทะเบียน — ถ้าลิงก์พาข้อมูลห้องมาด้วยก็ให้ตกไปใช้ฟอร์มลงทะเบียนตามปกติ
        // ส่วนปุ่มจาก rich menu ที่ไม่รู้ว่าห้องไหน ต้องบอกให้ไปขอลิงก์จากแอดมิน
        if (!(wsId && (rId || rNum))) {
          setPortalView({ kind: "not_registered" })
          return
        }
      }

      // ตรวจสอบว่าลิงก์นี้เปิดลงทะเบียนได้อีกหรือไม่ (สมัครได้ครั้งเดียวเท่านั้น)
      if (wsId && (rId || rNum)) {
        try {
          const checkRes = await fetch(`/api/register-tenant?workspaceId=${wsId}&roomId=${rId}&roomNumber=${rNum}`)
          const checkData = await checkRes.json()
          if (checkData.success) {
            if (checkData.registered) {
              setAlreadyRegistered(true)
            } else if (checkData.tenant) {
              setTenantName(checkData.tenant.name || "")
              setPhone(checkData.tenant.phone || "")
            }
            if (checkData.roomNumber) {
              setRoomNumber(checkData.roomNumber)
            }
          }
        } catch (e) {
          console.error("Error checking room registration:", e)
        }
      }
    } catch (err: any) {
      console.error("LIFF Init Error:", err)
      setError("ไม่สามารถเชื่อมต่อบริการ LINE ได้ กรุณาแชร์ลิงก์เปิดทางห้องแชท LINE หรือลองล็อกอินใหม่อีกครั้ง")
    } finally {
      const liff = (window as any).liff
      if (liff) {
        setPageInitializing(false)
      }
      (window as any).__liffInitializing = false
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).liff) {
      initLiff()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!roomId && !roomNumber.trim()) {
      setError("ไม่พบข้อมูลรหัสห้องพักจากลิงก์ กรุณาติดต่อแอดมินเพื่อขอลิงก์ใหม่")
      return
    }
    if (!tenantName.trim()) {
      setError("กรุณากรอกชื่อ-นามสกุลจริงของคุณ")
      return
    }
    if (phone.length !== 10) {
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก")
      return
    }
    if (!lineUserId) {
      setError("ไม่พบข้อมูลสิทธิ์ไลน์ กรุณาลองล็อกอินเข้าใช้งานใหม่อีกครั้ง")
      return
    }
    if (!workspaceId) {
      setError("ไม่พบข้อมูลรหัสอาพาร์ทเมนท์ในลิงก์ลงทะเบียนนี้")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/register-tenant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          roomId,
          roomNumber,
          tenantName,
          tenantPhone: phone,
          lineUserId,
          workspaceId
        })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "เกิดข้อผิดพลาดขึ้นระหว่างการลงทะเบียน")
      }

      setSuccess(true)

      // พาลูกค้าเปิดหน้าแอดไลน์แชทบิลอัตโนมัติทันทีหลังจากลงทะเบียนเสร็จ 1.5 วินาที ป้องกันการไม่แอดเพื่อน
      setTimeout(() => {
        if (typeof window !== "undefined") {
          const cleanBasicId = botBasicId.startsWith("@") ? botBasicId.substring(1) : botBasicId
          window.location.href = `https://line.me/R/ti/p/%40${cleanBasicId}`
        }
      }, 1500)

    } catch (err: any) {
      setError(err.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์หลักได้ กรุณาลองใหม่อีกครั้ง")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* โหลด LINE LIFF SDK ผ่าน CDN */}
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="afterInteractive"
        onLoad={initLiff}
      />

      {portalView && portalView.kind !== "redirecting" ? (
        <PortalStateCard view={portalView} />
      ) : pageInitializing || portalView?.kind === "redirecting" ? (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">
          {/* แสงวิบวับพรีเมียมรอบตัวหลังบ้าน (Ambient Glow Background) */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[90px] pointer-events-none" />

          <div className="w-full max-w-md z-10 space-y-6 text-center">
            {/* การ์ดแก้วพรีเมียม (Glassmorphism Card) */}
            <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-8 shadow-2xl shadow-emerald-950/5 flex flex-col items-center space-y-6 animate-in fade-in duration-300">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-pulse">
                  <Sparkles className="w-8 h-8" />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-100">กำลังดึงข้อมูลผู้เช่าและระบบ LINE...</h3>
                <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                  กรุณารอสักครู่ ระบบกำลังยืนยันบัญชี LINE และดึงข้อมูลสัญญาเช่าของห้องพักคุณ
                </p>
              </div>

              {/* Indeterminate loading bar */}
              <div className="w-full bg-slate-950/80 rounded-full h-2.5 overflow-hidden border border-slate-805 relative">
                <div 
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full absolute top-0 left-0 w-1/3 animate-[loadingBar_1.5s_infinite_ease-in-out]" 
                />
              </div>
            </div>
          </div>

          <style dangerouslySetInnerHTML={{__html: `
            @keyframes loadingBar {
              0% { left: -35%; width: 35%; }
              50% { width: 45%; }
              100% { left: 100%; width: 35%; }
            }
          `}} />
        </div>
      ) : (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">
          {/* แสงวิบวับพรีเมียมรอบตัวหลังบ้าน (Ambient Glow Background) */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[90px] pointer-events-none" />

          <div className="w-full max-w-md z-10 space-y-6">
            {/* การ์ดแก้วพรีเมียม (Glassmorphism Card) */}
            <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl shadow-emerald-950/5 relative">
              
              {/* ตรวจสอบพารามิเตอร์ URL ว่าครบถ้วนหรือไม่ */}
              {!workspaceId || (!roomId && !roomNumber) ? (
                <div className="text-center py-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="inline-flex items-center justify-center p-4 bg-rose-500/10 text-rose-400 rounded-full border border-rose-500/20 shadow-lg shadow-rose-500/5 animate-pulse">
                    <AlertCircle className="w-14 h-14" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-100">ลิงก์ลงทะเบียนไม่สมบูรณ์</h2>
                    <p className="text-rose-400 text-sm font-medium">
                      ไม่พบข้อมูล "ห้องพัก" หรือ "รหัสอาคาร"
                    </p>
                  </div>

                  <div className="bg-slate-950/50 border border-slate-900/80 rounded-2xl p-5 text-left space-y-4">
                    <p className="text-xs text-slate-300 leading-relaxed text-center">
                      ลิงก์ LINE LIFF ของท่านอาจถูกคัดลอกมาไม่ครบถ้วน หรือไม่มีการระบุหมายเลขห้องพักอย่างปลอดภัย
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                      กรุณาติดต่อผู้ดูแลหอพักหรือผู้ให้เช่า เพื่อให้ผู้ดูแลส่งลิงก์ลงทะเบียน LINE สำหรับห้องพักของคุณใหม่อีกครั้ง
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const liff = (window as any).liff
                        if (liff) {
                          liff.closeWindow()
                        }
                      }}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 font-semibold rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer"
                    >
                      เสร็จสิ้นและปิดหน้านี้
                    </button>
                  </div>
                </div>
              ) : alreadyRegistered ? (
                <div className="text-center py-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="inline-flex items-center justify-center p-4 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20 shadow-lg shadow-amber-500/5">
                    <AlertCircle className="w-14 h-14" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-100">ลิงก์ลงทะเบียนถูกใช้งานแล้ว</h2>
                    <p className="text-slate-400 text-sm font-medium">
                      ห้องพักหมายเลข <strong className="text-amber-400 font-mono">{roomNumber || "ไม่ระบุ"}</strong> ได้ลงทะเบียนผูก LINE เรียบร้อยแล้ว
                    </p>
                  </div>

                  <div className="bg-slate-950/50 border border-slate-900/80 rounded-2xl p-5 text-left space-y-4">
                    <p className="text-xs text-slate-300 leading-relaxed text-center">
                      ลิงก์ลงทะเบียนห้องกับบัญชี LINE สามารถใช้สมัครได้เพียง <strong>ครั้งเดียวเท่านั้น</strong> เพื่อความปลอดภัยสูงสุดของข้อมูลผู้เช่า
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed text-center">
                      หากคุณเพิ่งย้ายเข้าใหม่ หรือต้องการเปลี่ยนบัญชี LINE ที่ใช้รับบิลค่าเช่า กรุณาติดต่อผู้ดูแลหอพักเพื่อตรวจสอบข้อมูลหรือขอรับลิงก์ลงทะเบียนชุดใหม่
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={() => {
                        const liff = (window as any).liff
                        if (liff) {
                          liff.closeWindow()
                        }
                      }}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 font-semibold rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors cursor-pointer"
                    >
                      เสร็จสิ้นและปิดหน้านี้
                    </button>
                  </div>
                </div>
              ) : success ? (
                <div className="text-center py-6 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                  <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                    <CheckCircle2 className="w-14 h-14" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-slate-100">ลงทะเบียนสำเร็จ!</h2>
                    <p className="text-slate-400 text-sm font-medium">
                      ยินดีต้อนรับคุณ <strong className="text-emerald-400">{tenantName}</strong> เข้าสู่ระบบ
                    </p>
                  </div>

                  <div className="bg-slate-950/50 border border-slate-900/80 rounded-2xl p-5 text-left space-y-4">
                    <div className="flex gap-2.5 items-start">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold mt-0.5 shrink-0">1</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        กดปุ่ม <strong className="text-emerald-400">"เพิ่มเพื่อน LINE OA"</strong> ด้านล่างเพื่อเชื่อมต่อช่องทางรับแจ้งบิล ค่าน้ำ-ค่าไฟ และใบเสร็จรับเงิน (LINE ID: <strong className="text-emerald-400 font-bold">{botBasicId}</strong>)
                      </p>
                    </div>
                    <div className="flex gap-2.5 items-start">
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold mt-0.5 shrink-0">2</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        หลังจากแอดไลน์เรียบร้อยแล้ว ท่านสามารถกดปุ่ม <strong className="text-slate-500">"เสร็จสิ้นและปิดหน้านี้"</strong> เพื่อทำรายการอื่น ๆ ต่อได้ทันที
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <a
                      href={`https://line.me/R/ti/p/%40${botBasicId.startsWith("@") ? botBasicId.substring(1) : botBasicId}`}
                      className="w-full py-3.5 px-6 bg-[#06C755] hover:bg-[#05b04c] text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-sm transition-all transform active:scale-95 shadow-lg shadow-[#06C755]/15"
                    >
                      <MessageSquare className="w-4 h-4 fill-current" />
                      เพิ่มเพื่อน {botDisplayName} ({botBasicId})
                    </a>

                    <button
                      onClick={() => {
                        const liff = (window as any).liff
                        if (liff) {
                          liff.closeWindow()
                        }
                      }}
                      className="w-full py-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 text-slate-400 font-semibold rounded-2xl flex items-center justify-center gap-1.5 text-xs transition-colors"
                    >
                      เสร็จสิ้นและปิดหน้านี้
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* ส่วนหัวของฟอร์ม (Header) */}
                  <div className="text-center space-y-4">
                    <div className="relative inline-block">
                      {profile ? (
                        <div className="relative">
                          <img
                            src={profile.pictureUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=60"}
                            alt="LINE Avatar"
                            className="w-20 h-20 rounded-full border border-emerald-500/30 object-cover ring-4 ring-emerald-500/10 shadow-xl"
                          />
                          <span className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center">
                            <MessageSquare className="w-3 h-3 text-white fill-current" />
                          </span>
                        </div>
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 animate-pulse flex items-center justify-center">
                          <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <h1 className="text-xl font-black text-slate-100 flex items-center justify-center gap-1.5">
                        {profile ? `สวัสดีคุณ ${profile.displayName}` : "กำลังยืนยันบัญชี LINE..."}
                        <Sparkles className="w-4 h-4 text-emerald-400" />
                      </h1>
                      <p className="text-slate-400 text-xs font-semibold leading-relaxed">
                        กรุณากรอกข้อมูลส่วนบุคคลเพื่อบันทึกสัญญาเช่าและรับบริการบิลใน LINE
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

                  {/* ข้อความแจ้งเตือนข้อผิดพลาด */}
                  {error && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/25 rounded-2xl space-y-3 animate-shake">
                      <div className="flex items-center gap-2.5 text-rose-400 text-xs font-semibold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                      {!liffLoaded && (
                        <button
                          type="button"
                          onClick={() => {
                            setError("")
                            setPageInitializing(true)
                            initLiff()
                          }}
                          className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          ลองโหลดใหม่อีกครั้ง
                        </button>
                      )}
                    </div>
                  )}

                  {/* ฟิลด์อินพุต */}
                  <div className="space-y-4">
                    
                    {/* ฟิลด์หมายเลขห้อง (แบบล็อคค่า - Read Only) */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        หมายเลขห้องพัก (ลงทะเบียนพิเศษ)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full h-12 pl-11 pr-4 bg-slate-950/40 border border-slate-900 text-slate-500 rounded-2xl font-bold font-mono focus:outline-none cursor-not-allowed transition-all"
                          value={roomNumber || "ไม่ระบุข้อมูลห้องพัก"}
                          readOnly
                          disabled
                        />
                        <Home className="w-4 h-4 text-slate-600 absolute left-4 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    {/* ฟิลด์กรอก ชื่อ-นามสกุล (ผู้เช่ากรอกเอง) */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        ชื่อ - นามสกุลผู้เช่า
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="ระบุชื่อจริง และนามสกุลจริงของคุณ"
                          className="w-full h-12 pl-11 pr-4 bg-slate-950/60 border border-slate-800 rounded-2xl font-semibold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/20 focus:bg-slate-950 transition-all"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          disabled={loading}
                        />
                        <User className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    {/* ฟิลด์เบอร์โทรศัพท์ */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                        เบอร์โทรศัพท์มือถือ
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          inputMode="numeric"
                          placeholder="ระบุเบอร์โทรศัพท์ 10 หลัก"
                          className="w-full h-12 pl-11 pr-4 bg-slate-950/60 border border-slate-800 rounded-2xl font-semibold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/20 focus:bg-slate-950 transition-all font-mono"
                          value={phone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          disabled={loading}
                        />
                        <Phone className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                  </div>

                  {/* ค่าที่ซ่อนไว้สำหรับแบคเอนด์ (Hidden Inputs) */}
                  <input type="hidden" name="lineUserId" value={lineUserId} />
                  <input type="hidden" name="workspaceId" value={workspaceId} />

                  {/* ปุ่มกดยืนยัน */}
                  <button
                    type="submit"
                    disabled={loading || !liffLoaded}
                    className="w-full h-12.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-xl shadow-emerald-950/20 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-500/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>กำลังส่งข้อมูลลงทะเบียน...</span>
                      </>
                    ) : (
                      <span>ยืนยันข้อมูลและเริ่มใช้งาน</span>
                    )}
                  </button>

                </form>
              )}

            </div>

            <p className="text-center text-slate-600 text-[10px] font-semibold">
              หากข้อมูลห้องพักไม่ถูกต้อง กรุณาแจ้งผู้ดูแลอาคารเพื่อขอรับลิงก์สำหรับลงทะเบียนใหม่
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default function TenantRegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    }>
      <TenantRegisterContent />
    </Suspense>
  )
}
