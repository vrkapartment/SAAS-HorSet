"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  Key, 
  Server
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
        message: t("test_connection.connection_failed"),
        error: String(err)
      })
    } finally {
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

  return (
    <DashboardLayout role={role}>
      {/* Header section identical to other tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">
            {t("test_connection.title")}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {t("test_connection.subtitle")}
          </p>
        </div>
        <div className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
          Supabase Diagnostics
        </div>
      </div>

      {/* Connection Status Card */}
      <div className="glass-card rounded-2xl p-6 border border-slate-900/60 relative overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-500" /> {t("test_connection.test_results")}
          </h3>
          <button
            onClick={checkConnection}
            disabled={loading}
            className="glow-btn flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-blue-500 text-slate-300 hover:text-white text-xs font-semibold py-2 px-4 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("test_connection.retest")}
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-xs text-slate-400">{t("test_connection.testing")}</p>
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
                  {result.success ? t("test_connection.connection_success") : t("test_connection.connection_failed")}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {result.message.includes("ยังคงเป็นตัวอย่าง") 
                    ? t("test_connection.connection_failed") + " - " + result.message
                    : result.message}
                </p>
              </div>
            </div>

            {/* Details */}
            {result.success && result.details && (
              <div className="bg-slate-950/40 border border-slate-900 rounded-2xl p-5 space-y-3">
                <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t("test_connection.service_status")}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <span className="text-slate-400">{t("test_connection.auth_system")}</span>
                    <span className="text-teal-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {result.details.authConnection === "ปกติ" ? t("test_connection.normal") : result.details.authConnection}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <span className="text-slate-400">{t("test_connection.database_access")}</span>
                    <span className="text-teal-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {result.details.databaseConnection.includes("ปกติ") ? t("test_connection.normal") : t("test_connection.limited")}
                    </span>
                  </div>
                </div>
                {!result.details.databaseConnection.includes("ปกติ") && (
                  <p className="text-[10px] text-amber-400 mt-2">
                    {t("test_connection.sql_advice")}
                  </p>
                )}
              </div>
            )}

            {/* Error Details */}
            {!result.success && result.error && (
              <div className="bg-slate-950/40 border border-red-500/10 rounded-2xl p-5 space-y-2">
                <h4 className="text-xs text-red-400 font-bold uppercase tracking-wider">{t("test_connection.error_logs")}</h4>
                <pre className="text-[11px] text-slate-400 font-mono overflow-x-auto whitespace-pre-wrap bg-slate-950 p-3 rounded-lg border border-slate-900">
                  {typeof result.error === "object" ? JSON.stringify(result.error, null, 2) : String(result.error)}
                </pre>
              </div>
            )}

            {/* Env Status */}
            {result.envState && (
              <div className="space-y-3">
                <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">{t("test_connection.env_status")}</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="text-slate-500 font-mono text-[10px] mb-1">NEXT_PUBLIC_SUPABASE_URL</div>
                    <span className={result.envState.NEXT_PUBLIC_SUPABASE_URL.includes("ตั้งค่าแล้ว") || result.envState.NEXT_PUBLIC_SUPABASE_URL === "Configured" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                      {result.envState.NEXT_PUBLIC_SUPABASE_URL.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="text-slate-500 font-mono text-[10px] mb-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</div>
                    <span className={result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("ตั้งค่าแล้ว") || result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY === "Configured" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                      {result.envState.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
                    <div className="text-slate-500 font-mono text-[10px] mb-1">SUPABASE_SERVICE_ROLE_KEY</div>
                    <span className={result.envState.SUPABASE_SERVICE_ROLE_KEY.includes("ตั้งค่าแล้ว") || result.envState.SUPABASE_SERVICE_ROLE_KEY === "Configured" ? "text-teal-400 font-medium" : "text-amber-400 font-medium"}>
                      {result.envState.SUPABASE_SERVICE_ROLE_KEY.includes("ตั้งค่าแล้ว") ? t("test_connection.configured") : t("test_connection.not_configured")}
                    </span>
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

      {/* Step-by-Step Connection Instructions */}
      <div className="glass-card rounded-2xl p-6 border border-slate-900/60 space-y-6">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Key className="w-4 h-4 text-indigo-500" /> {t("test_connection.guide_title")}
        </h3>

        <div className="space-y-6 text-xs text-slate-300">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="w-6 h-6 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              1
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-200">{t("test_connection.step1_title")}</h4>
              <p className="text-slate-400 leading-relaxed">
                {t("test_connection.step1_desc")}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="w-6 h-6 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              2
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-200">{t("test_connection.step2_title")}</h4>
              <p className="text-slate-400 leading-relaxed">
                {t("test_connection.step2_desc")}
              </p>
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 font-mono text-slate-400 space-y-2 overflow-x-auto text-[11px]">
                <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_URL</span>=https://your-project-id.supabase.co</p>
                <p><span className="text-blue-400">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
                <p><span className="text-blue-400">SUPABASE_SERVICE_ROLE_KEY</span>=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</p>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="w-6 h-6 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              3
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-200">{t("test_connection.step3_title")}</h4>
              <p className="text-slate-400 leading-relaxed">
                {t("test_connection.step3_desc")}
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="w-6 h-6 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
              4
            </div>
            <div className="space-y-1.5">
              <h4 className="font-bold text-slate-200">{t("test_connection.step4_title")}</h4>
              <p className="text-slate-400 leading-relaxed">
                {t("test_connection.step4_desc")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
