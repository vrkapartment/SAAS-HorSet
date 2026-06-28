"use client"

import { useState, useEffect, Suspense } from "react"
import Script from "next/script"
import { Sparkles, MessageSquare, Phone, Home, Loader2, CheckCircle2, AlertCircle, User } from "lucide-react"

function TenantRegisterContent() {
  const [liffLoaded, setLiffLoaded] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [lineUserId, setLineUserId] = useState("")
  const [workspaceId, setWorkspaceId] = useState("")
  const [roomNumber, setRoomNumber] = useState("")
  const [phone, setPhone] = useState("")
  const [tenantName, setTenantName] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)
  const [pageInitializing, setPageInitializing] = useState(true)
  const [botBasicId, setBotBasicId] = useState("@423xmlwo")
  const [botDisplayName, setBotDisplayName] = useState("แชทบิลอัตโนมัติ")

  // ฟังก์ชันล้างเบอร์โทรศัพท์ให้อยู่ในฟอร์แมตตัวเลข 10 หลัก
  const handlePhoneChange = (val: string) => {
    const clean = val.replace(/\D/g, "").slice(0, 10)
    setPhone(clean)
  }

  // ฟังก์ชันสากลสำหรับดักจับพารามิเตอร์จาก URL ค้นหาทั้งใน Search และ Hash (สำหรับ LINE LIFF State)
  const getUrlParam = (name: string): string => {
    if (typeof window === "undefined") return ""

    // 1. ดักจับจาก URL Search ปกติ
    const searchParams = new URLSearchParams(window.location.search)
    let val = searchParams.get(name)
    if (val) return val

    // 2. ดักจับกรณีพิเศษของ LINE LIFF ที่ย้ายพารามิเตอร์ไปซ่อนไว้หลัง liff.state ใน Hash
    const hash = window.location.hash
    if (hash) {
      const liffStateMatch = hash.match(/liff\.state=([^&]+)/)
      if (liffStateMatch) {
        try {
          const decodedState = decodeURIComponent(liffStateMatch[1])
          if (decodedState.includes(`${name}=`)) {
            const stateParams = new URLSearchParams(decodedState)
            const stateVal = stateParams.get(name)
            if (stateVal) return stateVal
          } else {
            // กรณีเป็น JSON String
            const parsed = JSON.parse(decodedState)
            if (parsed[name]) return String(parsed[name])
          }
        } catch (e) {
          console.error(`Error parsing liff.state for ${name}:`, e)
        }
      }

      // ดักจับเพิ่มเติมหากมี ? ปนใน hash ทั่วไป
      if (hash.includes("?")) {
        const hashQuery = hash.substring(hash.indexOf("?"))
        const hashParams = new URLSearchParams(hashQuery)
        const hashVal = hashParams.get(name)
        if (hashVal) return hashVal
      }
    }

    return ""
  }

  const initLiff = async () => {
    try {
      const liff = (window as any).liff
      if (!liff) return

      // ดักจับค่าและเซ็ตพารามิเตอร์ที่ส่งมาจากลิงก์แอดมินก่อน เพื่อหา liff_id ไดนามิก
      const wsId = getUrlParam("workspace_id")
      setWorkspaceId(wsId)

      const rNum = getUrlParam("room_number")
      setRoomNumber(rNum)

      // เรียกดึง LIFF ID ที่ถูกต้องจากตารางฐานข้อมูลแยกราย Workspace
      let activeLiffId = "2010442620-H4josaDy" // default fallback
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

      await liff.init({ liffId: activeLiffId })
      setLiffLoaded(true)

      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }

      const userProfile = await liff.getProfile()
      setProfile(userProfile)
      setLineUserId(userProfile.userId)

      // ตรวจสอบว่าลิงก์นี้เปิดลงทะเบียนได้อีกหรือไม่ (สมัครได้ครั้งเดียวเท่านั้น)
      if (wsId && rNum) {
        try {
          const checkRes = await fetch(`/api/register-tenant?workspaceId=${wsId}&roomNumber=${rNum}`)
          const checkData = await checkRes.json()
          if (checkData.success) {
            if (checkData.registered) {
              setAlreadyRegistered(true)
            } else if (checkData.tenant) {
              setTenantName(checkData.tenant.name || "")
              setPhone(checkData.tenant.phone || "")
            }
          }
        } catch (e) {
          console.error("Error checking room registration:", e)
        }
      }
    } catch (err: any) {
      console.error("LIFF Init Error:", err)
      setError("ไม่สามารถเชื่อมต่อบริการ LINE ได้ กรุณาแชร์ลิงก์เปิดทางห้องแชท LINE")
    } finally {
      const liff = (window as any).liff
      if (liff) {
        setPageInitializing(false)
      }
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

    if (!roomNumber.trim()) {
      setError("ไม่พบข้อมูลหมายเลขห้องพักจากลิงก์ กรุณาติดต่อแอดมินเพื่อขอลิงก์ใหม่")
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

      {pageInitializing ? (
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
              
              {/* ตรวจสอบว่าลิงก์ถูกใช้งานไปแล้วหรือไม่ */}
              {alreadyRegistered ? (
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
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/25 rounded-2xl flex items-center gap-2.5 text-rose-400 text-xs font-semibold animate-shake">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
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
