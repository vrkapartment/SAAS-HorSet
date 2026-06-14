"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Database, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  ArrowLeft, 
  Key, 
  Link, 
  Terminal, 
  ExternalLink,
  ShieldCheck,
  Server
} from "lucide-react"

interface EnvState {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

interface TestResult {
  success: boolean
  message: string
  envState?: EnvState
  details?: {
    authConnection: string
    databaseConnection: string
  }
  error?: any
}

export default function TestConnectionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  const checkConnection = async () => {
    setLoading(true)
    setResult(null)
    try {
      const response = await fetch("/api/test-connection")
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setResult({
        success: false,
        message: "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อทำการทดสอบได้ กรุณาตรวจสอบว่าเซิร์ฟเวอร์รันอยู่",
        error: String(err)
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkConnection()
  }, [])

  return (
    <main className="relative min-h-screen bg-[#060a13] text-slate-100 font-sans overflow-hidden py-12 px-4">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[300px] h-[300px] bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10 space-y-8">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors py-2 px-4 rounded-lg bg-slate-900/50 border border-slate-800"
          >
            <ArrowLeft className="w-4 h-4" /> กลับสู่หน้าแรก
          </button>
          <div className="text-right">
            <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
              Supabase Diagnostics
            </span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 bg-blue-600/10 border border-blue-500/20 text-blue-500 rounded-2xl mb-2">
            <Database className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            ระบบตรวจสอบการเชื่อมต่อ Supabase
          </h1>
          <p className="text-sm text-slate-400 max-w-xl mx-auto">
            หน้านี้จะช่วยคุณตรวจสอบการเชื่อมต่อระหว่างแอปพลิเคชัน HorSet กับบริการฐานข้อมูล Supabase ในเครื่องของคุณ
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="glass-panel rounded-3xl p-8 border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-500" />
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <Server className="w-5 h-5 text-blue-400" /> ผลการตรวจสอบระบบ
            </h2>
            <button
              onClick={checkConnection}
              disabled={loading}
              className="glow-btn flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-blue-500 text-slate-300 hover:text-white text-xs font-semibold py-2 px-4 rounded-xl transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              ทดสอบใหม่
            </button>
          </div>

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
              <p className="text-sm text-slate-400">กำลังยิงคำขอเพื่อทดสอบการเชื่อมต่อฐานข้อมูล...</p>
            </div>
          ) : result ? (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-2xl flex items-start gap-3 border ${
                result.success 
                  ? "bg-teal-500/10 border-teal-500/20 text-teal-300" 
                  : "bg-red-500/10 border-red-500/20 text-red-300"
              }`}>
                {result.success ? (
                  <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h3 className="font-bold text-sm">
                    {result.success ? "การเชื่อมต่อสมบูรณ์" : "การเชื่อมต่อล้มเหลว"}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">{result.message}</p>
                </div>
              </div>

              {/* Details Details */}
              {result.success && result.details && (
                <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">สถานะของบริการ</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                      <span className="text-slate-400">ระบบ Authentication</span>
                      <span className="text-teal-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {result.details.authConnection}
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                      <span className="text-slate-400">การเข้าถึงฐานข้อมูล</span>
                      <span className="text-teal-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> {result.details.databaseConnection.includes("ปกติ") ? "ปกติ" : "มีข้อจำกัด"}
                      </span>
                    </div>
                  </div>
                  {!result.details.databaseConnection.includes("ปกติ") && (
                    <p className="text-[10px] text-amber-400 mt-2">
                      💡 คำแนะนำ: หากเชื่อมต่อฐานข้อมูลสำเร็จแต่ดึงตารางไม่ได้ แปลว่าคุณอาจจะยังไม่ได้ Run สคริปต์ SQL ใน Supabase SQL Editor เพื่อสร้างตาราง ให้ทำตามคำแนะนำด้านล่าง
                    </p>
                  )}
                </div>
              )}

              {/* Error Details */}
              {!result.success && result.error && (
                <div className="bg-slate-950/40 border border-red-500/10 rounded-2xl p-5 space-y-2">
                  <h4 className="text-xs text-red-400 font-bold uppercase tracking-wider">Error Logs</h4>
                  <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap bg-slate-950 p-3 rounded-lg border border-slate-900">
                    {typeof result.error === "object" ? JSON.stringify(result.error, null, 2) : String(result.error)}
                  </pre>
                </div>
              )}

              {/* Env Status */}
              {result.envState && (
                <div className="space-y-3">
                  <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">สถานะของตัวแปรสภาพแวดล้อม (Environment Variables)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                      <div className="text-slate-500 font-mono text-[10px] mb-1">NEXT_PUBLIC_SUPABASE_URL</div>
                      <span className={result.envState.NEXT_PUBLIC_SUPABASE_URL === "ตั้งค่าแล้ว" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                        {result.envState.NEXT_PUBLIC_SUPABASE_URL}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                      <div className="text-slate-500 font-mono text-[10px] mb-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                      <span className={result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY === "ตั้งค่าแล้ว" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                        {result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                      <div className="text-slate-500 font-mono text-[10px] mb-1">SUPABASE_SERVICE_ROLE_KEY</div>
                      <span className={result.envState.SUPABASE_SERVICE_ROLE_KEY === "ตั้งค่าแล้ว" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                        {result.envState.SUPABASE_SERVICE_ROLE_KEY}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              ยังไม่มีการตรวจสอบ
            </div>
          )}
        </div>

        {/* Step-by-Step Connection Instructions */}
        <div className="glass-card rounded-3xl p-8 border border-white/5 space-y-6">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <Key className="w-5 h-5 text-indigo-400" /> คู่มือการตั้งค่าเพื่อเชื่อมต่อ Supabase
          </h2>

          <div className="space-y-6 text-sm text-slate-300">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-200">สร้างโครงการใน Supabase</h3>
                <p className="text-xs text-slate-400">
                  หากยังไม่มีโครงการ ให้เข้าไปที่{" "}
                  <a href="https://supabase.com" target="_blank" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                    Supabase.com <ExternalLink className="w-3 h-3" />
                  </a>{" "}
                  และสมัครสมาชิก จากนั้นสร้างโครงการใหม่ (New Project)
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-200">คัดลอกรหัส API และนำมาใส่ใน .env</h3>
                <p className="text-xs text-slate-400">
                  ไปที่โครงการของคุณใน Supabase 👉 <strong>Settings &gt; API</strong> จากนั้นคัดลอกค่าต่างๆ และนำมาเปิดแก้ไขไฟล์ <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-400 font-mono">.env</code> ในโปรเจคหลัก:
                </p>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-xs text-slate-400 space-y-2 overflow-x-auto">
                  <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_URL</span>=https://your-project-id.supabase.co</p>
                  <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
                  <p><span className="text-blue-400">SUPABASE_SERVICE_ROLE_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-200">สร้างตารางฐานข้อมูลและตั้งค่า RLS</h3>
                <p className="text-xs text-slate-400">
                  ไปที่โครงการใน Supabase 👉 <strong>SQL Editor</strong> เลือก <strong>New query</strong> แล้วคัดลอกคำสั่งในไฟล์ <code className="bg-slate-900 px-1.5 py-0.5 rounded text-indigo-400 font-mono">schema.sql</code> ของโปรเจคไปวางทั้งหมด จากนั้นคลิก <strong>Run</strong> เพื่อทำการสร้างตาราง นโยบาย RLS และ Trigger ต่างๆ ในทันที
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="w-7 h-7 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                4
              </div>
              <div className="space-y-1.5">
                <h3 className="font-bold text-slate-200">ทดสอบระบบ</h3>
                <p className="text-xs text-slate-400">
                  เมื่อทำขั้นตอนด้านบนเสร็จเรียบร้อย ให้กลับมากดปุ่ม <strong>"ทดสอบใหม่"</strong> ด้านบนเพื่อยืนยันว่าเชื่อมต่อกับฐานข้อมูลอย่างถูกต้อง 100% แล้ว
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
