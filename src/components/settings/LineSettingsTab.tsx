"use client"

import React, { useState, useEffect } from "react"
import { 
  MessageSquare, 
  Key, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  Info, 
  Check, 
  Settings,
  HelpCircle
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserProfileClient } from "@/features/auth/client"

export default function LineSettingsTab() {
  const [profileLoading, setProfileLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  
  // Settings Inputs
  const [tokenInput, setTokenInput] = useState("")
  const [liffInput, setLiffInput] = useState("")
  
  // Password Visibility
  const [showToken, setShowToken] = useState(false)
  
  // Action status
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  
  // Quota Status
  const [fetchingQuota, setFetchingQuota] = useState(false)
  const [quotaData, setQuotaData] = useState<any>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)

  const isDemo = !process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL.includes("localhost") && !process.env.NEXT_PUBLIC_SUPABASE_URL

  useEffect(() => {
    async function loadWorkspaceAndSettings() {
      setProfileLoading(true)
      try {
        let wsId = ""
        
        if (!isDemo) {
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            setCurrentUser(res.data)
            wsId = res.data.workspace_id || "d290f1ee-6c54-4b01-90e6-d701748f0851"
            setWorkspaceId(wsId)
          } else {
            setSettingsError("ไม่สามารถระบุตัวตนของผู้ใช้ได้ กรุณาล็อกอินใหม่อีกครั้ง")
            setProfileLoading(false)
            return
          }

          // Fetch settings from workspace_line_settings table
          const supabase = createClient()
          const { data, error } = await supabase
            .from("workspace_line_settings")
            .select("*")
            .eq("workspace_id", wsId)
            .maybeSingle()

          if (error) {
            console.warn("Could not query workspace_line_settings, it may need creation:", error.message)
          } else if (data) {
            setTokenInput(data.channel_access_token || "")
            setLiffInput(data.liff_id || "")
            setIsConfigured(!!data.channel_access_token)
            
            // Set initial quota display from cache row
            if (data.limit_count) {
              setQuotaData({
                limit: data.limit_count,
                consumed: data.consumed_count,
                remaining: data.remaining_count,
                percentage_used: data.percentage_used,
                cached: true,
                source: "database",
                updated_at: data.updated_at
              })
            }
          }
        } else {
          // Demo Mode
          setWorkspaceId("d290f1ee-6c54-4b01-90e6-d701748f0851")
          setTokenInput("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_apartment_owner")
          setLiffInput("2010442620-H4josaDy")
          setIsConfigured(true)
          setQuotaData({
            limit: 1000,
            consumed: 125,
            remaining: 875,
            percentage_used: 13,
            cached: true,
            source: "demo",
            updated_at: new Date().toISOString()
          })
        }
      } catch (err: any) {
        console.error("Error initializing LINE Settings:", err)
        setSettingsError("เกิดข้อผิดพลาดในการดึงข้อมูลจากระบบหลังบ้าน")
      } finally {
        setProfileLoading(false)
      }
    }
    loadWorkspaceAndSettings()
  }, [isDemo])

  const loadLineQuota = async (forceRefresh = false) => {
    if (!workspaceId) return
    setFetchingQuota(true)
    setQuotaError(null)

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setQuotaData({
        limit: 1000,
        consumed: 125,
        remaining: 875,
        percentage_used: 13,
        cached: false,
        source: "demo",
        updated_at: new Date().toISOString()
      })
      setFetchingQuota(false)
      return
    }

    try {
      const supabase = createClient()
      const { data, error: funcErr } = await supabase.functions.invoke(
        `get-line-quota?workspace_id=${workspaceId}${forceRefresh ? "&bypass_cache=true" : ""}`,
        {
          method: "GET"
        }
      )

      if (funcErr) throw funcErr

      if (data && data.success) {
        setQuotaData({
          limit: data.limit,
          consumed: data.consumed,
          remaining: data.remaining,
          percentage_used: data.percentage_used,
          source: data.source,
          cached: data.cached,
          updated_at: data.updated_at
        })
      } else {
        throw new Error(data?.error || "ไม่สามารถดึงข้อมูลโควตาจากระบบ LINE ได้")
      }
    } catch (err: any) {
      console.error("Error fetching LINE quota:", err)
      setQuotaError(err.message || "เกิดข้อผิดพลาดในการติดต่อ Edge Function")
    } finally {
      setFetchingQuota(false)
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspaceId) return
    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(null)

    const trimmedToken = tokenInput.trim()
    const trimmedLiff = liffInput.trim()

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      setIsConfigured(!!trimmedToken)
      setSettingsSuccess("บันทึกการเชื่อมต่อจำลองสำเร็จ!")
      setSavingSettings(false)
      return
    }

    try {
      const supabase = createClient()
      
      // Select first to determine if we insert or update
      const { data: existingRow, error: checkErr } = await supabase
        .from("workspace_line_settings")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

      if (checkErr) throw checkErr

      let error = null
      if (existingRow) {
        const { error: updateErr } = await supabase
          .from("workspace_line_settings")
          .update({
            channel_access_token: trimmedToken || null,
            liff_id: trimmedLiff || null,
            updated_at: new Date().toISOString()
          })
          .eq("workspace_id", workspaceId)
        error = updateErr
      } else {
        const { error: insertErr } = await supabase
          .from("workspace_line_settings")
          .insert({
            workspace_id: workspaceId,
            channel_access_token: trimmedToken || null,
            liff_id: trimmedLiff || null,
            limit_count: 1000,
            consumed_count: 0,
            remaining_count: 1000,
            percentage_used: 0,
            updated_at: new Date().toISOString()
          })
        error = insertErr
      }

      if (error) throw error

      setIsConfigured(!!trimmedToken)
      setSettingsSuccess("บันทึกข้อมูลการเชื่อมต่อ LINE OA สำเร็จ!")
      
      // Trigger a live quota reload
      if (trimmedToken) {
        loadLineQuota(true)
      }
    } catch (err: any) {
      console.error("Error saving LINE settings:", err)
      setSettingsError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลตั้งค่า")
    } finally {
      setSavingSettings(false)
    }
  }

  const handleDeleteSettings = async () => {
    if (!workspaceId) return
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลเชื่อมต่อ LINE OA นี้? ลูกบ้านจะไม่สามารถลงทะเบียนผูก LINE หรือรับบิลได้")) return

    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(null)

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      setTokenInput("")
      setLiffInput("")
      setIsConfigured(false)
      setQuotaData(null)
      setSettingsSuccess("ลบข้อมูลเชื่อมต่อจำลองเรียบร้อยแล้ว")
      setSavingSettings(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("workspace_line_settings")
        .update({
          channel_access_token: null,
          liff_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("workspace_id", workspaceId)

      if (error) throw error

      setTokenInput("")
      setLiffInput("")
      setIsConfigured(false)
      setQuotaData(null)
      setSettingsSuccess("ลบการเชื่อมต่อ LINE OA ของคุณเรียบร้อยแล้ว")
    } catch (err: any) {
      console.error("Error deleting LINE settings:", err)
      setSettingsError(err.message || "เกิดข้อผิดพลาดในการลบข้อมูลตั้งค่า")
    } finally {
      setSavingSettings(false)
    }
  }

  if (profileLoading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>กำลังดึงข้อมูลตั้งค่า LINE OA ของหอพักคุณ...</span>
      </div>
    )
  }

  const percentage = quotaData?.percentage_used || 0

  return (
    <div className="space-y-6">
      
      {/* 1. Page Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 rounded-3xl border border-blue-500/20 shadow-sm backdrop-blur-md">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 font-sans">
            <MessageSquare className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>เชื่อมต่อ LINE OA (Personal LINE OA Integration)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-sans">
            เชื่อมต่อเซิร์ฟเวอร์ LINE Developers และเปิดใช้งาน Messaging API เพื่อส่งบิลแจ้งหนี้ในรูปแบบ Flex Message สุดพรีเมียมให้ลูกบ้านโดยตรงภายใต้แบรนด์หอพักคุณเอง
          </p>
        </div>
      </div>

      {/* 2. Header Information Alert */}
      <div className="p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-2xl flex gap-3 text-blue-600 dark:text-blue-400">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="space-y-1.5 font-bold">
          <h4 className="font-extrabold text-sm sm:text-base">ระบบเชื่อมต่อ LINE OA ส่วนตัวรายหอพัก</h4>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
            ระบบของเราทำงานแบบแยกอิสระ (Multi-Tenancy) ให้หอพักของคุณได้เชื่อมต่อกับ LINE Developers ของตนเองโดยตรง ส่งผลให้ลูกบ้านรับบิลแจ้งค่าเช่าด้วยระบบแชทพรีเมียม (Flex Message) ภายใต้ชื่อ LINE OA แบรนด์หอพักคุณเอง และใช้โควตารายเดือนแยกต่างหากอย่างปลอดภัย
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Left side: Forms & Settings */}
        <div className="space-y-6">
          
          {/* Card: Configuration Settings */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-slate-200">
                  ตั้งค่าเชื่อมต่อ LINE Messaging API
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                  เชื่อมต่อเซิร์ฟเวอร์ LINE OA เข้ากับระบบส่งบิลของคุณ
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5 pt-2">
              {/* Token Input */}
              <div className="space-y-2">
                <label className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                  LINE Channel Access Token (Long-Lived)
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showToken ? "text" : "password"}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full pl-3 pr-10 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                  >
                    {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* LIFF ID Input */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <label className="text-xs sm:text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    LINE LIFF ID
                  </label>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                    * จำเป็นเพื่อเชื่อมโยงผู้ใช้ให้ตรงกับ Provider ของคุณ
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="2010442620-H4josaDy"
                  className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors"
                  value={liffInput}
                  onChange={(e) => setLiffInput(e.target.value)}
                  required
                />
              </div>

              {/* Status Alert */}
              {settingsError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3.5 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{settingsSuccess}</span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2.5 justify-end pt-2">
                {isConfigured && (
                  <button
                    type="button"
                    onClick={handleDeleteSettings}
                    disabled={savingSettings}
                    className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  >
                    ลบการเชื่อมต่อ
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
                >
                  {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{isConfigured ? "อัปเดตข้อมูลเชื่อมต่อ" : "บันทึกข้อมูลเชื่อมต่อ"}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card: Quota Check */}
          {isConfigured && (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-500/10 text-green-500 rounded-xl">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-slate-200">
                      ตรวจสอบโควตา LINE OA ของหอพัก
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      แสดงสถานะการส่งข้อความผ่าน LINE Messaging API ในเดือนนี้
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadLineQuota(true)}
                  disabled={fetchingQuota}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl text-sm font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchingQuota ? "animate-spin text-green-500" : ""}`} />
                  <span>รีเฟรชค่าสด</span>
                </button>
              </div>

              {quotaError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-sm font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quotaError}</span>
                </div>
              )}

              {quotaData ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">ส่งไปแล้ว</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.consumed.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">คงเหลือ</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.remaining.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">โควตารวม</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.limit.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">ข้อความ</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs sm:text-sm font-extrabold text-slate-500 dark:text-slate-400">
                      <span>เปอร์เซ็นต์โควตาที่ใช้ไป</span>
                      <span className={`${percentage >= 85 ? "text-rose-500 animate-pulse" : "text-blue-500"} font-black`}>{percentage}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-850/35">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentage >= 90 ? "bg-rose-500" : percentage >= 75 ? "bg-amber-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-bold pt-1">
                    <span className="flex items-center gap-1.5">
                      {quotaData.cached ? (
                        <span className="bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500">แคชระบบ</span>
                      ) : (
                        <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 text-xs font-bold">อัปเดตสด</span>
                      )}
                      <span>แหล่งที่มา: {quotaData.source}</span>
                    </span>
                    <span>ล่าสุด: {new Date(quotaData.updated_at).toLocaleTimeString("th-TH")} น.</span>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-sm font-bold">
                  <span>ยังไม่มีข้อมูลโควตา LINE บันทึกไว้ กรุณากดปุ่มเพื่อดึงข้อมูลสด</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right side: Owner Setup Tutorial Manual */}
        <div className="space-y-6">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base md:text-lg font-black text-slate-800 dark:text-slate-200">
                  คู่มือเชื่อมต่อระบบ LINE OA ส่วนตัว
                </h3>
                <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                  ขั้นตอนรับสิทธิ์ส่งบิลและลงทะเบียนผู้เช่าแบบแยกหอพักอิสระ
                </p>
              </div>
            </div>

            {/* Instruction Steps List */}
            <div className="space-y-6 text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
              
              <div className="relative pl-8 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-xs font-black border border-blue-500/20">
                  1
                </div>
                <h4 className="text-sm sm:text-md font-extrabold text-slate-850 dark:text-slate-100">สร้าง Provider สำหรับหอพัก</h4>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  เข้าสู่เว็บ <a href="https://developers.line.biz" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5 font-bold">LINE Developers Console <ExternalLink className="w-3 h-3" /></a> สมัครบัญชีผู้พัฒนา ➡️ กดปุ่ม **Create Provider** (ตั้งชื่อโฟลเดอร์เป็นชื่อหอพักของคุณ เพื่อความเป็นสัดส่วน)
                </p>
              </div>

              <div className="relative pl-8 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-xs font-black border border-blue-500/20">
                  2
                </div>
                <h4 className="text-sm sm:text-md font-extrabold text-slate-850 dark:text-slate-100">สร้างบอทรับแจ้งเตือน (Messaging API)</h4>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                  ภายใต้ Provider เดิม กดสร้าง Channel ใหม่ เลือกหัวข้อ **Messaging API** ➡️ กรอกข้อมูลของบอทหอพักคุณให้เสร็จ ➡️ เลื่อนแถบไปที่หัวข้อด้านบนชื่อ **Messaging API** ➡️ เลื่อนลงไปด้านล่างสุดหัวข้อ **Channel access token (long-lived)** ➡️ กดปุ่ม **Issue** คัดลอกรหัสความปลอดภัยยาว ๆ มากรอกในช่องด้านซ้ายของหน้านี้
                </p>
              </div>

              <div className="relative pl-8 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-xs font-black border border-blue-500/20">
                  3
                </div>
                <h4 className="text-sm sm:text-md font-extrabold text-slate-850 dark:text-slate-100">สร้างหน้ายืนยันสิทธิ์ (LINE Login & LIFF)</h4>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium space-y-2">
                  <span>เพื่อป้องกันปัญหาจำสิทธิ์ผู้เช่าสลับกัน **ต้องสร้างใน Provider เดียวกันกับบอทข้อ 2** ➡️ กด **Create New Channel** เลือก **LINE Login**</span><br />
                  <span>➡️ ไปที่แท็บด้านบนชื่อ **LIFF** กด **Add LIFF** ➡️ ตั้งชื่อ LIFF, ขนาดจอแนะนำแบบ **Full**</span><br />
                  <span>➡️ ในช่อง **Endpoint URL** ให้คัดลอกค่าด้านล่างนี้ไปวาง:</span>
                  <span className="block mt-1 p-2.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl text-blue-500 font-mono text-xs sm:text-sm select-all break-all">
                    https://{typeof window !== "undefined" ? window.location.hostname : "saas-horset.vercel.app"}/tenant-register
                  </span>
                  <span>➡️ คัดลอกรหัส **LIFF ID** มากรอกในช่องด้านซ้าย แล้วกดปุ่มบันทึกการตั้งค่า</span>
                </p>
              </div>

              {/* Crucial Pitfalls & Warnings Section */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h5 className="text-xs sm:text-sm uppercase tracking-wider text-rose-500 dark:text-rose-400 font-extrabold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" /> 
                  ข้อควรระวังสำคัญที่สุด (ป้องกันระบบทำงานล้มเหลว)
                </h5>

                <div className="p-5 rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/15 dark:border-rose-500/25 space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium">
                  
                  {/* Warning 1 */}
                  <div className="space-y-1">
                    <strong className="text-sm font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      1. ต้องเผยแพร่สถานะ LINE Login เสมอ (เปลี่ยนเป็น "Published")
                    </strong>
                    <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                      เมื่อเริ่มสร้าง LINE Login ระบบจะตั้งสถานะเริ่มต้นเป็น <strong className="text-slate-700 dark:text-slate-300 font-bold">Developing (สีเทา)</strong> ทำให้เฉพาะตัวแอดมินเท่านั้นที่ใช้งานลิงก์ได้ แต่ผู้เช่าทั่วไปจะเจอปัญหากดสมัครไม่ได้หรือหน้าจอลูปหมุนวนไม่หยุด <strong className="text-emerald-500 dark:text-emerald-400 font-extrabold">วิธีแก้:</strong> คลิกที่แถบสถานะกลม ๆ สีเทามุมขวาบนของหน้า LINE Login ให้เปลี่ยนเป็นสถานะ <strong className="text-emerald-500 dark:text-emerald-400 font-extrabold">Published (สีเขียว)</strong> ก่อนใช้งานจริง
                    </p>
                  </div>

                  {/* Warning 2 */}
                  <div className="space-y-1">
                    <strong className="text-sm font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      2. Endpoint URL ของ LIFF ต้องมีสแลช "/tenant-register" เสมอ
                    </strong>
                    <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                      ตรวจสอบว่าในช่อง Endpoint URL ตอนลงทะเบียน LIFF มีค่าต่อท้ายครบถ้วน ไม่เป็นเพียงชื่อโดเมนเปล่า ๆ มิฉะนั้นผู้เช่าที่กดลิงก์มาจะหาข้อมูลห้องพักไม่เจอและจะขึ้นแจ้งเตือน <strong className="text-rose-500 font-bold">"ไม่ระบุข้อมูลห้องพัก"</strong> ป้องกันการยืนยันข้อมูล
                    </p>
                  </div>

                  {/* Warning 3 */}
                  <div className="space-y-1">
                    <strong className="text-sm font-extrabold text-slate-850 dark:text-slate-100 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                      3. วิธีส่งต่อลิงก์ลงทะเบียนที่ถูกต้อง
                    </strong>
                    <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                      เมื่อแอดมินคลิกปุ่ม <strong className="text-slate-700 dark:text-slate-300 font-bold">"เจนลิงก์ LINE"</strong> ให้ทำการกดปุ่ม <strong className="text-slate-700 dark:text-slate-300 font-bold">"คัดลอกลิงก์"</strong> แล้วส่งให้ผู้เช่าตรง ๆ ทางแชททันที <strong className="text-rose-500 font-bold">ห้ามแอดมินกดเปิดลิงก์ทดสอบก่อนแล้วไปก๊อปปี้ URL บนเว็บเบราว์เซอร์ส่งให้ผู้เช่าเด็ดขาด</strong> เพราะข้อมูลตัวตนของหอพักและหมายเลขห้องพักจะสูญหายทันที
                    </p>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
