"use client"

import { useState, useEffect } from "react"
import Script from "next/script"
import { Sparkles, MessageSquare, Phone, Home, Loader2, CheckCircle2, AlertCircle } from "lucide-react"

export default function TenantRegisterPage() {
  const [liffLoaded, setLiffLoaded] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [lineUserId, setLineUserId] = useState("")
  const [workspaceId, setWorkspaceId] = useState("")
  const [roomNumber, setRoomNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [tenantName, setTenantName] = useState("")
  const [error, setError] = useState("")

  // ฟังก์ชันล้างเบอร์โทรศัพท์ให้อยู่ในฟอร์แมตตัวเลข 10 หลัก
  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 10)
    setPhone(clean)
  }

  // ดึงค่า workspace_id จาก URL หรือ liff.state hash
  const getWorkspaceId = () => {
    if (typeof window === "undefined") return ""

    // 1. ดักจับจาก URL Search ปกติ
    const searchParams = new URLSearchParams(window.location.search)
    let wsId = searchParams.get("workspace_id")
    if (wsId) return wsId

    // 2. ดักจับกรณีพิเศษของ LINE LIFF ที่มักย้ายพารามิเตอร์ไปไว้ใน Hash (หลัง liff.state)
    const hash = window.location.hash
    if (hash) {
      const liffStateMatch = hash.match(/liff\.state=([^&]+)/)
      if (liffStateMatch) {
        try {
          const decodedState = decodeURIComponent(liffStateMatch[1])
          if (decodedState.includes("workspace_id=")) {
            const stateParams = new URLSearchParams(decodedState)
            const stateWsId = stateParams.get("workspace_id")
            if (stateWsId) return stateWsId
          } else {
            // เผื่อเป็น JSON
            const parsed = JSON.parse(decodedState)
            if (parsed.workspace_id) return parsed.workspace_id
          }
        } catch (e) {
          console.error("Error parsing liff.state:", e)
        }
      }

      // ตรวจสอบแบบตรง ๆ เผื่อมี ? ใน hash
      if (hash.includes("?")) {
        const hashQuery = hash.substring(hash.indexOf("?"))
        const hashParams = new URLSearchParams(hashQuery)
        const hashWsId = hashParams.get("workspace_id")
        if (hashWsId) return hashWsId
      }
    }

    return ""
  }

  const initLiff = async () => {
    try {
      const liff = (window as any).liff
      if (!liff) return

      await liff.init({ liffId: "2010442620-H4josaDy" })
      setLiffLoaded(true)

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const userProfile = await liff.getProfile()
      setProfile(userProfile)
      setLineUserId(userProfile.userId)

      // ดึงและตั้งค่า workspace_id
      const wsId = getWorkspaceId()
      setWorkspaceId(wsId)
    } catch (err: any) {
      console.error("LIFF Init Error:", err)
      setError("ไม่สามารถเริ่มการเชื่อมต่อ LINE ได้ กรุณาเปิดผ่านห้องแชทไลน์")
    }
  }

  // เรียกลุยทันทีเมื่อ CDN โหลดเสร็จสิ้น
  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).liff) {
      initLiff()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (!roomNumber.trim()) {
      setError("กรุณากรอกหมายเลขห้องพัก")
      return
    }
    if (phone.length !== 10) {
      setError("กรุณากรอกเบอร์โทรศัพท์ให้ครบ 10 หลัก")
      return
    }
    if (!lineUserId) {
      setError("ไม่พบข้อมูล LINE User ID กรุณาเชื่อมต่อไลน์ใหม่อีกครั้ง")
      return
    }
    if (!workspaceId) {
      setError("ไม่พบข้อมูลรหัสอาพาร์ทเมนท์ (workspace_id) กรุณาแสกน QR Code ประจำหอพักของคุณ")
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
          roomNumber,
          phone,
          lineUserId,
          workspaceId
        })
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || "เกิดข้อผิดพลาดในการลงทะเบียน")
      }

      setTenantName(data.tenantName)
      setSuccess(true)

      // ปิดหน้าต่างไลน์อัตโนมัติหลังลงทะเบียนสำเร็จ 3 วินาที
      setTimeout(() => {
        const liff = (window as any).liff
        if (liff) {
          liff.closeWindow()
        }
      }, 3000)

    } catch (err: any) {
      setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
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

      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 relative overflow-hidden font-sans">
        {/* แสงวิบวับรอบตัวหลังบ้าน (Ambient Glow Background) */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] h-[320px] bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/3 w-[260px] h-[260px] bg-blue-500/10 rounded-full blur-[90px] pointer-events-none" />

        <div className="w-full max-w-md z-10 space-y-6">
          {/* การ์ดแก้วพรีเมียม (Glassmorphism Card) */}
          <div className="bg-slate-900/40 backdrop-blur-2xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl shadow-emerald-950/5 relative">
            
            {/* โชว์ความสำเร็จเมื่อสำเร็จ */}
            {success ? (
              <div className="text-center py-10 space-y-5 animate-in fade-in zoom-in-95 duration-300">
                <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20 shadow-lg shadow-emerald-500/5">
                  <CheckCircle2 className="w-14 h-14" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-100">ลงทะเบียนสำเร็จ!</h2>
                  <p className="text-slate-400 text-sm font-medium">
                    ยินดีต้อนรับคุณ <strong className="text-emerald-400">{tenantName}</strong> เข้าสู่ระบบ
                  </p>
                  <p className="text-xs text-slate-500 mt-4">
                    ระบบได้ผูกไลน์นี้เข้ากับห้องพักของคุณเรียบร้อยแล้ว<br />
                    คุณจะได้รับใบแจ้งหนี้ ค่าน้ำ ค่าไฟ ผ่านแชทไลน์โดยตรง<br />
                    <span className="inline-block mt-3 text-emerald-500/70 font-semibold">หน้าต่างกำลังปิดตัวเองลงเพื่อเด้งกลับเข้าแชทไลน์...</span>
                  </p>
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
                      {profile ? `สวัสดีคุณ ${profile.displayName}` : "กำลังโหลดโปรไฟล์ไลน์..."}
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                    </h1>
                    <p className="text-slate-400 text-xs font-semibold">
                      กรุณายืนยันข้อมูลห้องพักเพื่อเปิดรับบริการแจ้งยอดบิลใน LINE
                    </p>
                  </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-slate-800 to-transparent" />

                {/* ข้อความแจ้งเตือนข้อผิดพลาด */}
                {error && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-center gap-2.5 text-rose-400 text-xs font-semibold animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* ฟิลด์อินพุต */}
                <div className="space-y-4">
                  
                  {/* ฟิลด์หมายเลขห้อง */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      หมายเลขห้องพัก
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="ตัวอย่างเช่น 101, A2"
                        className="w-full h-12 pl-11 pr-4 bg-slate-950/60 border border-slate-800 rounded-2xl font-semibold text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/20 focus:bg-slate-950 transition-all font-mono"
                        value={roomNumber}
                        onChange={(e) => setRoomNumber(e.target.value)}
                        disabled={loading}
                      />
                      <Home className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* ฟิลด์เบอร์โทรศัพท์ */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      เบอร์โทรศัพท์ผู้เช่า
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
            หากคุณประสบปัญหาในการลงทะเบียน กรุณาติดต่อผู้ดูแลหอพักของคุณโดยตรง
          </p>
        </div>
      </div>
    </>
  )
}
