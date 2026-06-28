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
      
      {/* 1. Header Information Alert */}
      <div className="p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-2xl flex gap-3 text-blue-600 dark:text-blue-400">
        <Info className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1 font-bold">
          <h4 className="font-extrabold text-sm">ระบบเชื่อมต่อ LINE OA ส่วนตัวรายหอพัก</h4>
          <p className="dark:text-slate-300">
            ระบบของเราทำงานแบบแยกอิสระ (Multi-Tenancy) ให้หอพักของคุณได้เชื่อมต่อกับ LINE Developers ของตนเองโดยตรง ส่งผลให้ลูกบ้านรับบิลแจ้งค่าเช่าด้วยระบบแชทพรีเมียม (Flex Message) ภายใต้ชื่อ LINE OA แบรนด์หอพักคุณเอง และใช้โควตารายเดือนแยกต่างหากอย่างปลอดภัย
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* 2. Left side: Forms & Settings */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Card: Configuration Settings */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-md font-extrabold text-slate-800 dark:text-slate-200">
                  ตั้งค่าเชื่อมต่อ LINE Messaging API
                </h3>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                  เชื่อมต่อเซิร์ฟเวอร์ LINE OA เข้ากับระบบส่งบิลของคุณ
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 pt-2">
              {/* Token Input */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider block">
                  LINE Channel Access Token (Long-Lived)
                </label>
                <div className="relative flex items-center">
                  <input
                    type={showToken ? "text" : "password"}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full pl-3 pr-10 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-xs font-mono transition-colors"
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

              {/* Status Alert */}
              {settingsError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{settingsError}</span>
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3.5 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl text-xs font-bold flex items-center gap-2">
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
                    className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-extrabold cursor-pointer transition-colors"
                  >
                    ลบการเชื่อมต่อ
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
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
                    <h3 className="text-md font-extrabold text-slate-800 dark:text-slate-200">
                      ตรวจสอบโควตา LINE OA ของหอพัก
                    </h3>
                    <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                      แสดงสถานะการส่งข้อความผ่าน LINE Messaging API ในเดือนนี้
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadLineQuota(true)}
                  disabled={fetchingQuota}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 rounded-xl text-xs font-extrabold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className={`w-3 h-3 ${fetchingQuota ? "animate-spin text-green-500" : ""}`} />
                  <span>รีเฟรชค่าสด</span>
                </button>
              </div>

              {quotaError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quotaError}</span>
                </div>
              )}

              {quotaData ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">ส่งไปแล้ว</span>
                      <strong className="text-md font-black text-slate-800 dark:text-slate-200">{quotaData.consumed.toLocaleString()}</strong>
                      <span className="text-[9px] text-slate-400 font-bold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">คงเหลือ</span>
                      <strong className="text-md font-black text-slate-800 dark:text-slate-200">{quotaData.remaining.toLocaleString()}</strong>
                      <span className="text-[9px] text-slate-400 font-bold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-850/60 rounded-2xl">
                      <span className="text-[10px] text-slate-400 font-bold block mb-1">โควตารวม</span>
                      <strong className="text-md font-black text-slate-800 dark:text-slate-200">{quotaData.limit.toLocaleString()}</strong>
                      <span className="text-[9px] text-slate-400 font-bold block mt-0.5">ข้อความ</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] font-extrabold text-slate-400">
                      <span>เปอร์เซ็นต์โควตาที่ใช้ไป</span>
                      <span className={percentage >= 85 ? "text-rose-500 animate-pulse" : "text-blue-500"}>{percentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-850/35">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          percentage >= 90 ? "bg-rose-500" : percentage >= 75 ? "bg-amber-500" : "bg-blue-600"
                        }`}
                        style={{ width: `${Math.min(100, percentage)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold pt-1">
                    <span className="flex items-center gap-1.5">
                      {quotaData.cached ? (
                        <span className="bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[9px]">แคชระบบ</span>
                      ) : (
                        <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 text-[9px]">อัปเดตสด</span>
                      )}
                      <span>แหล่งที่มา: {quotaData.source}</span>
                    </span>
                    <span>ล่าสุด: {new Date(quotaData.updated_at).toLocaleTimeString("th-TH")} น.</span>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-xs font-bold">
                  <span>ยังไม่มีข้อมูลโควตา LINE บันทึกไว้ กรุณากดปุ่มเพื่อดึงข้อมูลสด</span>
                </div>
              )}
            </div>
          )}

        </div>

        {/* 3. Right side: Owner Setup Tutorial Manual */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-md font-extrabold text-slate-800 dark:text-slate-200">
                  คู่มือเชื่อมต่อระบบ LINE OA หอพัก
                </h3>
                <p className="text-[11px] text-slate-400 font-bold mt-0.5">
                  ขั้นตอนรับสิทธิ์ส่งบิลและลงทะเบียนแบบแยกอิสระ
                </p>
              </div>
            </div>

            {/* Instruction Steps List */}
            <div className="space-y-4.5 text-xs font-bold leading-relaxed text-slate-600 dark:text-slate-300">
              
              <div className="relative pl-7 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-[10px] font-black border border-blue-500/20">
                  1
                </div>
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200">สร้าง LINE Messaging API</h4>
                <p className="text-[11px] text-slate-400">
                  เข้าเว็บ <a href="https://developers.line.biz" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-0.5 font-bold">LINE Developers <ExternalLink className="w-3 h-3" /></a> สมัครบัญชี คอนโซล ➡️ กด **Create Provider** (ใช้ชื่อหอพักคุณ) ➡️ จากนั้นกดสร้าง Channel ใหม่ เลือกหัวข้อ **Messaging API**
                </p>
              </div>

              <div className="relative pl-7 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-[10px] font-black border border-blue-500/20">
                  2
                </div>
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200">คัดลอก Channel Access Token</h4>
                <p className="text-[11px] text-slate-400">
                  เข้าไปที่ Channel Messaging API ที่สร้างเสร็จ ➡️ กดแถบด้านบนชื่อ **Messaging API** ➡️ เลื่อนลงไปหัวข้อล่างสุด **Channel access token (long-lived)** ➡️ กดปุ่ม **Issue** แล้วคัดลอกรหัสที่ได้มาใส่ในฟอร์มด้านซ้าย
                </p>
              </div>

              <div className="relative pl-7 space-y-1.5">
                <div className="absolute left-0 top-0.5 w-5 h-5 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center text-[10px] font-black border border-blue-500/20">
                  3
                </div>
                <h4 className="font-extrabold text-slate-800 dark:text-slate-200">เสร็จสิ้น! เริ่มต้นใช้งานได้ทันที</h4>
                <p className="text-[11px] text-slate-400">
                  ลูกบ้านจะสามารถกดลงทะเบียนผู้เช่าและเริ่มรับบิล Flex Message ผ่านทางห้องแชท LINE OA ของหอพักคุณได้ทันที โดยไม่มีขั้นตอนตั้งค่า LINE Login หรือสร้าง LIFF App เพิ่มเติมให้ยุ่งยาก เนื่องจากระบบของเราจะจัดการเชื่อมโยงรหัสผู้ใช้ (UID) และบริการรับส่งบิลให้แบบอัตโนมัติอย่างราบรื่นครับ!
                </p>
              </div>

            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
