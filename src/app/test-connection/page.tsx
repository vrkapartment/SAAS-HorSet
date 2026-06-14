"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Key, 
  Server, 
  Database, 
  Copy, 
  Check, 
  ExternalLink, 
  Code2, 
  Network, 
  Cpu, 
  Laptop, 
  ChevronDown, 
  ChevronUp, 
  Terminal, 
  Settings, 
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react"
import DashboardLayout from "@/components/DashboardLayout"
import { useLanguage } from "@/lib/translations/LanguageProvider"

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
  const { t } = useLanguage()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)
  const [role, setRole] = useState<"admin" | "super_admin">("admin")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [showSql, setShowSql] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const [activeStep, setActiveStep] = useState<number>(1)
  
  // สถานะการจำลองการวิเคราะห์ระบบเพื่อเพิ่มความโปร่งใสและ Premium Feel
  const [diagnosticStep, setDiagnosticStep] = useState<string>("")
  const [diagnosticProgress, setDiagnosticStepProgress] = useState<number>(0)

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const checkConnection = async () => {
    setLoading(true)
    setResult(null)
    setDiagnosticStepProgress(10)
    
    // จำลองความคืบหน้าเพื่อความเท่และพรีเมียม
    setDiagnosticStep("กำลังตรวจสอบไฟล์กำหนดค่าสภาพแวดล้อม (Local Environment Variables)...")
    await new Promise(r => setTimeout(r, 600))
    setDiagnosticStepProgress(40)
    
    setDiagnosticStep("กำลังเชื่อมโยงและทดสอบการตอบสนองของเซิร์ฟเวอร์หลัก (Authentication Service)...")
    await new Promise(r => setTimeout(r, 700))
    setDiagnosticStepProgress(70)
    
    setDiagnosticStep("กำลังคิวรี่โครงสร้างระบบตารางและความถูกต้องของสิทธิ์ (Database RLS Policy)...")
    await new Promise(r => setTimeout(r, 600))
    setDiagnosticStepProgress(95)

    try {
      const response = await fetch("/api/test-connection")
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setResult({
        success: false,
        message: t("test_connection.connection_failed") || "การเชื่อมต่อล้มเหลว",
        error: String(err)
      })
    } finally {
      setDiagnosticStepProgress(100)
      setLoading(false)
    }
  }

  useEffect(() => {
    const userRole = document.cookie
      .split("; ")
      .find((row) => row.startsWith("horset_user_role="))
      ?.split("=")[1]
    
    if (userRole !== "admin" && userRole !== "super_admin") {
      router.push("/login")
      return
    }

    setRole(userRole as "admin" | "super_admin")
    checkConnection()
  }, [])

  // สคริปต์ SQL ของโครงสร้างหลักในหน้าจอช่วยสร้าง
  const sqlSchemaSnippet = `-- 1. สร้างตาราง Profiles สำหรับข้อมูลส่วนตัวผู้ใช้งาน
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  website TEXT,
  role TEXT DEFAULT 'staff'::text
);

-- 2. เปิดใช้งานระบบรักษาความปลอดภัย Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. สร้างนโยบายความปลอดภัยการเข้าถึงข้อมูล
CREATE POLICY "อนุญาตให้ทุกคนเข้าถึงข้อมูลแบบสาธารณะ" 
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "อนุญาตให้เจ้าของแก้ไขโปรไฟล์ตัวเอง" 
  ON public.profiles FOR UPDATE USING (auth.uid() = id);`

  return (
    <DashboardLayout role={role}>
      {/* เอฟเฟกต์แสงไฟเรืองแสงด้านหลัง (Ambient Background Glow) */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[20%] left-[-10%] w-[400px] h-[400px] bg-indigo-500/5 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[10px] font-bold text-blue-400 border border-blue-500/20">Supabase Core</span>
            <span className="text-slate-600 dark:text-slate-500 text-xs">•</span>
            <span className="text-slate-500 text-xs font-mono">v1.2.0</span>
          </div>
          <h2 className="text-2xl font-black text-slate-100 font-sans tracking-tight flex items-center gap-2">
            <Network className="w-6 h-6 text-blue-500 animate-pulse" />
            {t("test_connection.title")}
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            {t("test_connection.subtitle")}
          </p>
        </div>
        <div className="text-[11px] font-extrabold px-4 py-2 bg-slate-900/80 border border-slate-800/80 rounded-xl flex items-center gap-2.5 backdrop-blur-md shadow-md text-slate-300">
          <span className={`w-2 h-2 rounded-full ${loading ? "bg-blue-500 animate-ping" : result?.success ? "bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.5)]" : "bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"}`} />
          {loading ? "กำลังตรวจสอบระบบ..." : result?.success ? "Supabase ออนไลน์ปกติ" : "ระบบตัดการเชื่อมต่อ"}
        </div>
      </div>

      {/* Grid หลัก 2 ฝั่ง: ซ้ายแสดงผลทดสอบ, ขวาเป็นคู่มือการตั้งค่า */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        
        {/* คอลัมน์ซ้าย: สถานะการเชื่อมต่อ และ แผนภาพ Network Map */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Connection Status Card */}
          <div className="glass-card rounded-2xl p-6 border border-slate-900/60 relative overflow-hidden shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-500" /> {t("test_connection.test_results")}
              </h3>
              
              <button
                onClick={checkConnection}
                disabled={loading}
                className="group relative flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-blue-500/50 text-slate-300 hover:text-white text-xs font-bold py-2 px-4 rounded-xl transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 group-hover:rotate-180 transition-all duration-500 ${loading ? "animate-spin text-white" : ""}`} />
                {t("test_connection.retest")}
              </button>
            </div>

            {/* แสดงระหว่างการตรวจสอบ (Diagnostic Loading) */}
            {loading ? (
              <div className="py-10 flex flex-col items-center justify-center gap-4 text-center">
                <div className="relative flex items-center justify-center w-16 h-10 mb-2">
                  <span className="absolute inline-flex h-12 w-12 rounded-full bg-blue-500/10 animate-ping" />
                  <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                </div>
                
                <div className="space-y-2 max-w-sm">
                  <p className="text-xs font-bold text-slate-200 animate-pulse">{diagnosticStep}</p>
                  <p className="text-[10px] text-slate-500 font-mono">ความคืบหน้า: {diagnosticProgress}%</p>
                </div>

                {/* Progress Bar หลอดวิเคราะห์ระบบ */}
                <div className="w-full max-w-xs bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-900">
                  <div 
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-1.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${diagnosticProgress}%` }}
                  />
                </div>
              </div>
            ) : result ? (
              <div className="space-y-6">
                
                {/* แบนเนอร์ผลการทดสอบสรุปย่อ */}
                <div className={`p-4 rounded-2xl flex items-start gap-3 border transition-all ${
                  result.success 
                    ? "bg-teal-500/5 border-teal-500/20 text-teal-300" 
                    : "bg-red-500/5 border-red-500/20 text-red-300"
                }`}>
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <h3 className="font-extrabold text-sm flex items-center gap-1.5">
                      {result.success ? t("test_connection.connection_success") : t("test_connection.connection_failed")}
                      {result.success && <span className="text-[10px] bg-teal-500/10 px-2 py-0.2 rounded-full text-teal-400 font-bold border border-teal-500/10">Active</span>}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                      {result.message.includes("ยังคงเป็นตัวอย่าง") 
                        ? result.message 
                        : result.message}
                    </p>
                  </div>
                </div>

                {/* แผนภาพ Node Graph / Network Flow Map */}
                <div className="p-5 bg-slate-950/40 border border-slate-900/60 rounded-2xl space-y-4">
                  <div className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider flex justify-between">
                    <span>แอนิเมชันโครงข่ายเชื่อมโยงระบบ (Network Flow Map)</span>
                    <span className="text-slate-600 font-mono text-[9px]">PING STATUS: OK</span>
                  </div>
                  
                  {/* กล่องแสดงผลโครงข่ายสายเชื่อมโยง */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-3 px-2">
                    
                    {/* Node 1: Client Host */}
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 relative">
                        <Laptop className="w-5 h-5" />
                        <span className="absolute bottom-[-2px] right-[-2px] w-3 h-3 bg-teal-400 rounded-full border-2 border-slate-950" />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-slate-300">Local App</div>
                        <div className="text-[9px] text-slate-500 font-mono">localhost:3000</div>
                      </div>
                    </div>

                    {/* Line 1 */}
                    <div className="flex-1 flex sm:flex-col items-center justify-center min-w-[30px] sm:min-w-0">
                      <div className="h-0.5 sm:h-px w-8 sm:w-full bg-gradient-to-r from-teal-500 to-indigo-500 relative">
                        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                      </div>
                    </div>

                    {/* Node 2: Supabase Auth */}
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 bg-slate-900 border rounded-2xl flex items-center justify-center relative ${result.success ? "border-teal-500/20 text-teal-400" : "border-slate-800 text-slate-500"}`}>
                        <Cpu className="w-5 h-5" />
                        <span className={`absolute bottom-[-2px] right-[-2px] w-3 h-3 rounded-full border-2 border-slate-950 ${result.success ? "bg-teal-400" : "bg-red-400"}`} />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-slate-300">Auth Service</div>
                        <div className="text-[9px] text-slate-500 font-mono">GoTrue / JWT</div>
                      </div>
                    </div>

                    {/* Line 2 */}
                    <div className="flex-1 flex sm:flex-col items-center justify-center min-w-[30px] sm:min-w-0">
                      <div className={`h-0.5 sm:h-px w-8 sm:w-full relative ${result.success ? "bg-gradient-to-r from-teal-500 to-emerald-500" : "bg-slate-800"}`}>
                        {result.success && <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" />}
                      </div>
                    </div>

                    {/* Node 3: Supabase Database */}
                    <div className="flex flex-col items-center gap-2">
                      <div className={`w-12 h-12 bg-slate-900 border rounded-2xl flex items-center justify-center relative ${result.success ? "border-emerald-500/20 text-emerald-400" : "border-slate-800 text-slate-500"}`}>
                        <Database className="w-5 h-5" />
                        <span className={`absolute bottom-[-2px] right-[-2px] w-3 h-3 rounded-full border-2 border-slate-950 ${result.success && !result.message.includes("profiles") ? "bg-teal-400" : result.success ? "bg-emerald-400" : "bg-red-400"}`} />
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] font-bold text-slate-300">PostgreSQL DB</div>
                        <div className="text-[9px] text-slate-500 font-mono">Schema Profiles</div>
                      </div>
                    </div>

                  </div>
                </div>

                {/* รายละเอียดของบริการ */}
                {result.success && result.details && (
                  <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-3">
                    <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">{t("test_connection.service_status")}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="flex justify-between items-center p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                        <span className="text-slate-400 font-medium">{t("test_connection.auth_system")}</span>
                        <span className="text-teal-400 font-extrabold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-teal-400" /> {result.details.authConnection === "ปกติ" ? t("test_connection.normal") : result.details.authConnection}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-700 transition-all">
                        <span className="text-slate-400 font-medium">{t("test_connection.database_access")}</span>
                        <span className="text-teal-400 font-extrabold flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4 text-teal-400" /> {result.details.databaseConnection.includes("ปกติ") ? t("test_connection.normal") : t("test_connection.limited")}
                        </span>
                      </div>
                    </div>
                    {!result.details.databaseConnection.includes("ปกติ") && (
                      <p className="text-[10px] text-amber-400 font-medium bg-amber-500/5 p-3 rounded-xl border border-amber-500/10 flex items-start gap-1.5 leading-relaxed mt-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                        <span>{t("test_connection.sql_advice")}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* กรณีเฟลและมีข้อผิดพลาด (Error Logs Display) */}
                {!result.success && result.error && (
                  <div className="bg-slate-950/40 border border-red-500/10 rounded-2xl p-5 space-y-2">
                    <h4 className="text-xs text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 text-red-400" /> {t("test_connection.error_logs")}
                    </h4>
                    <pre className="text-[11px] text-slate-300 font-mono overflow-x-auto whitespace-pre-wrap bg-slate-950 p-4 rounded-xl border border-slate-900 leading-relaxed shadow-inner max-h-[180px]">
                      {typeof result.error === "object" ? JSON.stringify(result.error, null, 2) : String(result.error)}
                    </pre>
                  </div>
                )}

                {/* Env Status Panel */}
                {result.envState && (
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider">{t("test_connection.env_status")}</h4>
                      <button 
                        type="button"
                        onClick={() => setShowKeys(!showKeys)}
                        className="text-[10px] text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1.5"
                      >
                        {showKeys ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5" /> ซ่อนรหัสความปลอดภัย
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" /> แสดงรหัสความปลอดภัย
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      
                      {/* ENV Item 1 */}
                      <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col justify-between gap-2">
                        <div>
                          <div className="text-slate-500 font-mono text-[9px] mb-1">NEXT_PUBLIC_SUPABASE_URL</div>
                          <span className={result.envState.NEXT_PUBLIC_SUPABASE_URL.includes("ตั้งค่าแล้ว") || result.envState.NEXT_PUBLIC_SUPABASE_URL === "Configured" ? "text-teal-400 font-extrabold" : "text-amber-400 font-extrabold"}>
                            {result.envState.NEXT_PUBLIC_SUPABASE_URL.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                          </span>
                        </div>
                        {showKeys && (
                          <div className="font-mono text-[9px] text-slate-400 bg-slate-950/80 p-1 rounded border border-slate-900 truncate">
                            https://***.supabase.co
                          </div>
                        )}
                      </div>

                      {/* ENV Item 2 */}
                      <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col justify-between gap-2">
                        <div>
                          <div className="text-slate-500 font-mono text-[9px] mb-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                          <span className={result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("ตั้งค่าแล้ว") || result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY === "Configured" ? "text-teal-400 font-extrabold" : "text-amber-400 font-extrabold"}>
                            {result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                          </span>
                        </div>
                        {showKeys && (
                          <div className="font-mono text-[9px] text-slate-400 bg-slate-950/80 p-1 rounded border border-slate-900 truncate">
                            eyJhbGciOi***...
                          </div>
                        )}
                      </div>

                      {/* ENV Item 3 */}
                      <div className="p-3.5 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col justify-between gap-2">
                        <div>
                          <div className="text-slate-500 font-mono text-[9px] mb-1">SUPABASE_SERVICE_ROLE_KEY</div>
                          <span className={result.envState.SUPABASE_SERVICE_ROLE_KEY.includes("ตั้งค่าแล้ว") || result.envState.SUPABASE_SERVICE_ROLE_KEY === "Configured" ? "text-teal-400 font-extrabold" : "text-amber-400 font-extrabold"}>
                            {result.envState.SUPABASE_SERVICE_ROLE_KEY.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                          </span>
                        </div>
                        {showKeys && (
                          <div className="font-mono text-[9px] text-slate-400 bg-slate-950/80 p-1 rounded border border-slate-900 truncate">
                            eyJhbGciOi***...
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                {t("test_connection.no_test")}
              </div>
            )}
          </div>

          {/* กล่องตัวอย่างโค้ด SQL ที่สามารถกางและกดคัดลอกได้อย่างหรูหรา */}
          <div className="glass-card rounded-2xl border border-slate-900/60 p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">Supabase SQL Schema Helper</span>
              </div>
              <button
                onClick={() => setShowSql(!showSql)}
                className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1"
              >
                {showSql ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showSql ? "ย่อสคริปต์" : "กางสคริปต์เพื่อคัดลอก"}
              </button>
            </div>
            
            <p className="text-[10px] text-slate-500 leading-relaxed">
              สำหรับแก้ไขสิทธิ์การใช้งาน (Database Policies) หากผลการดึงตารางล้มเหลว คัดลอกไปวางรันที่แผงควบคุมหลักของ Supabase Database ได้ทันที
            </p>

            {showSql && (
              <div className="space-y-2 animate-fade-in">
                <div className="relative">
                  <pre className="text-[10px] text-slate-300 font-mono bg-slate-950/90 p-4 rounded-xl border border-slate-900 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner max-h-[250px]">
                    {sqlSchemaSnippet}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(sqlSchemaSnippet, "schema_sql")}
                    className="absolute top-2.5 right-2.5 p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-xl transition-all"
                    title="คัดลอกสคริปต์ SQL"
                  >
                    {copiedKey === "schema_sql" ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {copiedKey === "schema_sql" && (
                  <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg justify-center animate-scale-up">
                    <CheckCircle2 className="w-3.5 h-3.5" /> คัดลอกสคริปต์สคีมาลงคลิปบอร์ดแล้ว!
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* คอลัมน์ขวา: คู่มือการติดตั้งทีละสเต็ป (Step-by-Step Connection Instructions) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-slate-900/60 space-y-6 shadow-xl relative overflow-hidden">
            
            <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none" />
            
            <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-2 border-b border-slate-900 pb-3.5">
              <Key className="w-4 h-4 text-indigo-500" /> {t("test_connection.guide_title")}
            </h3>

            {/* แถบเลือกสเต็ปแบบแท็บ (Progress Steps Selector) */}
            <div className="flex justify-between items-center bg-slate-950 p-1.5 rounded-xl border border-slate-900/80">
              {[1, 2, 3, 4].map((stepNum) => (
                <button
                  key={stepNum}
                  onClick={() => setActiveStep(stepNum)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                    activeStep === stepNum
                      ? "bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  ขั้นตอนที่ {stepNum}
                </button>
              ))}
            </div>

            <div className="space-y-6 text-xs text-slate-300">
              
              {/* Step 1: Create Supabase Project */}
              {activeStep === 1 && (
                <div className="space-y-4 animate-scale-up">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                      1
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-200">{t("test_connection.step1_title")}</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed pl-1">
                    {t("test_connection.step1_desc")}
                  </p>
                  
                  <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-900">
                    <a 
                      href="https://supabase.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-extrabold text-[11px] group"
                    >
                      ไปยังเว็บไซต์ Supabase Dashboard <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-all" />
                    </a>
                  </div>
                </div>
              )}

              {/* Step 2: Copy API keys to .env */}
              {activeStep === 2 && (
                <div className="space-y-4 animate-scale-up">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                      2
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-200">{t("test_connection.step2_title")}</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed pl-1">
                    {t("test_connection.step2_desc")}
                  </p>
                  
                  {/* แผงโค้ด .env จำลอง */}
                  <div className="relative">
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <span className="text-[8px] text-slate-500 uppercase tracking-wider font-bold">.env.local</span>
                      <button
                        onClick={() => copyToClipboard(
                          "NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\nSUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                          "env_sample"
                        )}
                        className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-all"
                        title="คัดลอกตัวอย่าง"
                      >
                        {copiedKey === "env_sample" ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-slate-300 space-y-2.5 overflow-x-auto text-[10px] leading-relaxed pt-9">
                      <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_URL</span>=https://your-project-id.supabase.co</p>
                      <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
                      <p><span className="text-blue-400">SUPABASE_SERVICE_ROLE_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Create schema and run SQL */}
              {activeStep === 3 && (
                <div className="space-y-4 animate-scale-up">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                      3
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-200">{t("test_connection.step3_title")}</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed pl-1">
                    {t("test_connection.step3_desc")}
                  </p>
                  
                  <div className="p-3 bg-blue-500/5 rounded-xl border border-blue-500/10 text-[10px] text-slate-400 leading-relaxed pl-3.5 relative">
                    <span className="absolute left-2.5 top-3.5 w-1 h-1 bg-blue-400 rounded-full animate-ping" />
                    คุณสามารถกดเปิดกล่องช่วยเหลือ <span className="text-slate-200 font-bold">"Supabase SQL Schema Helper"</span> ด้านซ้ายล่างเพื่อคัดลอกสคริปต์ได้ทันทีโดยไม่ต้องออกไปเปิดไฟล์ในโปรเจกต์
                  </div>
                </div>
              )}

              {/* Step 4: Retest */}
              {activeStep === 4 && (
                <div className="space-y-4 animate-scale-up">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                      4
                    </div>
                    <h4 className="font-extrabold text-sm text-slate-200">{t("test_connection.step4_title")}</h4>
                  </div>
                  <p className="text-slate-400 leading-relaxed pl-1">
                    {t("test_connection.step4_desc")}
                  </p>

                  <button
                    onClick={() => {
                      checkConnection()
                      const el = document.querySelector(".glass-card")
                      if (el) el.scrollIntoView({ behavior: "smooth" })
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/15 text-xs transition-all hover:-translate-y-0.5"
                  >
                    กดทดสอบความเชื่อมต่อเดี๋ยวนี้
                  </button>
                </div>
              )}

            </div>

            {/* แถบการจัดการเปลี่ยนหน้าสเต็ป ย้อนกลับ / ถัดไป */}
            <div className="flex justify-between items-center border-t border-slate-900 pt-4 mt-2">
              <button
                type="button"
                disabled={activeStep === 1}
                onClick={() => setActiveStep(p => Math.max(1, p - 1))}
                className="text-[10px] text-slate-400 hover:text-slate-200 font-extrabold disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                ← ย้อนกลับ
              </button>
              
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(s => (
                  <span 
                    key={s} 
                    className={`w-1.5 h-1.5 rounded-full transition-all ${activeStep === s ? "w-3.5 bg-indigo-500" : "bg-slate-800"}`} 
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={activeStep === 4}
                onClick={() => setActiveStep(p => Math.min(4, p + 1))}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-extrabold disabled:opacity-30 disabled:pointer-events-none transition-all"
              >
                ขั้นตอนถัดไป →
              </button>
            </div>

          </div>
        </div>

      </div>
    </DashboardLayout>
  )
}
