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
  HelpCircle,
  Copy,
  ChevronDown,
  ChevronUp
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
  const [isEditing, setIsEditing] = useState(false)
  const [savedToken, setSavedToken] = useState("")
  const [savedLiff, setSavedLiff] = useState("")
  
  // Quota Status
  const [fetchingQuota, setFetchingQuota] = useState(false)
  const [quotaData, setQuotaData] = useState<any>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  
  // Interactive Manual & Utility states
  const [showManual, setShowManual] = useState(true)
  const [copiedEndpoint, setCopiedEndpoint] = useState(false)
  const [openStep1, setOpenStep1] = useState(true)
  const [openStep2, setOpenStep2] = useState(true)
  const [openStep3, setOpenStep3] = useState(true)
  const [openWarnings, setOpenWarnings] = useState(true)

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
            setSavedToken(data.channel_access_token || "")
            setSavedLiff(data.liff_id || "")
            setIsConfigured(!!data.channel_access_token)
            
            // Set initial quota display from cache row
            if (data.limit_count !== null && data.limit_count !== undefined) {
              setQuotaData({
                limit: data.limit_count,
                consumed: data.consumed_count,
                remaining: data.remaining_count,
                percentage_used: data.percentage_used,
                displayName: "LINE OA ของหอพัก",
                basicId: "@line_oa",
                cached: true,
                source: "database",
                updated_at: data.updated_at
              })
            }
            if (data.channel_access_token) {
              // Trigger a background non-forced refresh to get bot profile/fresher quota
              setTimeout(() => loadLineQuota(false, wsId), 100)
            }
          }
        } else {
          // Demo Mode
          setWorkspaceId("d290f1ee-6c54-4b01-90e6-d701748f0851")
          setTokenInput("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_apartment_owner")
          setLiffInput("2010442620-H4josaDy")
          setSavedToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_apartment_owner")
          setSavedLiff("2010442620-H4josaDy")
          setIsConfigured(true)
          setQuotaData({
            limit: 1000,
            consumed: 125,
            remaining: 875,
            percentage_used: 13,
            displayName: "LINE OA ของหอพัก (Demo)",
            basicId: "@line_oa_demo",
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

  const loadLineQuota = async (forceRefresh = false, targetWorkspaceId?: string) => {
    const activeWsId = targetWorkspaceId || workspaceId
    if (!activeWsId) return
    setFetchingQuota(true)
    setQuotaError(null)

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 800))
      setQuotaData({
        limit: 1000,
        consumed: 125,
        remaining: 875,
        percentage_used: 13,
        displayName: "LINE OA ของหอพัก (Demo)",
        basicId: "@line_oa_demo",
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
        `get-line-quota?workspace_id=${activeWsId}${forceRefresh ? "&bypass_cache=true" : ""}`,
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
          displayName: data.displayName || "LINE OA ของหอพัก",
          basicId: data.basicId || "@line_oa",
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
      setSavedToken(trimmedToken)
      setSavedLiff(trimmedLiff)
      setIsEditing(false)
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
      setSavedToken(trimmedToken)
      setSavedLiff(trimmedLiff)
      setIsEditing(false)
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

  const handleCancelEdit = () => {
    setTokenInput(savedToken)
    setLiffInput(savedLiff)
    setIsEditing(false)
    setSettingsError(null)
    setSettingsSuccess(null)
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
      setSavedToken("")
      setSavedLiff("")
      setIsConfigured(false)
      setIsEditing(false)
      setQuotaData(null)
      setSettingsSuccess("ลบการเชื่อมต่อ LINE OA ของคุณเรียบร้อยแล้ว")
    } catch (err: any) {
      console.error("Error deleting LINE settings:", err)
      setSettingsError(err.message || "เกิดข้อผิดพลาดในการลบข้อมูลตั้งค่า")
    } finally {
      setSavingSettings(false)
    }
  }

  const handleCopyEndpoint = () => {
    if (typeof window !== "undefined") {
      const endpoint = "https://saas-horset.vercel.app/tenant-register"
      navigator.clipboard.writeText(endpoint)
      setCopiedEndpoint(true)
      setTimeout(() => setCopiedEndpoint(false), 2000)
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
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5 font-sans">
            <MessageSquare className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>เชื่อมต่อ LINE OA (Personal LINE OA Integration)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-sans font-semibold">
            เชื่อมต่อเซิร์ฟเวอร์ LINE Developers และเปิดใช้งาน Messaging API เพื่อส่งบิลแจ้งหนี้ในรูปแบบ Flex Message สุดพรีเมียมให้ลูกบ้านโดยตรงภายใต้แบรนด์หอพักคุณเอง
          </p>
        </div>
        <button
          onClick={() => setShowManual(!showManual)}
          className="shrink-0 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          {showManual ? (
            <>
              <EyeOff className="w-4 h-4" />
              <span>ซ่อนคู่มือการตั้งค่า</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>แสดงคู่มือการตั้งค่า</span>
            </>
          )}
        </button>
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

      <div className={`grid grid-cols-1 ${showManual ? "lg:grid-cols-2" : "lg:grid-cols-1"} gap-6 items-start transition-all duration-300`}>
        
        {/* Left side: Forms & Settings */}
        <div className="space-y-6">
          
          {/* Card: Configuration Settings */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
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
                    className="w-full pl-3 pr-10 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    required
                    disabled={isConfigured && !isEditing}
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
                  className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  value={liffInput}
                  onChange={(e) => setLiffInput(e.target.value)}
                  required
                  disabled={isConfigured && !isEditing}
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
              <div className="flex gap-2.5 justify-end pt-2 flex-wrap">
                {isConfigured && !isEditing && (
                  <button
                    type="button"
                    onClick={handleDeleteSettings}
                    disabled={savingSettings}
                    className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  >
                    ลบการเชื่อมต่อ
                  </button>
                )}

                {isConfigured && isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingSettings}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  >
                    ยกเลิกการแก้ไข
                  </button>
                )}

                {isConfigured && !isEditing ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(true)
                      setSettingsSuccess(null)
                      setSettingsError(null)
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-blue-500/10"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>แก้ไขข้อมูล API</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
                  >
                    {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{isConfigured ? "อัปเดตข้อมูลเชื่อมต่อ" : "บันทึกข้อมูลเชื่อมต่อ"}</span>
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Card: Quota Information */}
          {isConfigured && (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>ตรวจสอบโควตา LINE OA</span>
                      {quotaData?.displayName && (
                        <span className="text-blue-600 dark:text-blue-400">
                          "{quotaData.displayName}"
                        </span>
                      )}
                    </h3>
                    {quotaData && (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-lg text-[11px] font-black border border-green-500/20 shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping shrink-0" />
                          <span>{quotaData.displayName || "LINE OA ของหอพัก"}</span>
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono font-bold bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200/50 dark:border-slate-800/60 shadow-sm shrink-0">
                          {quotaData.basicId || "@line_oa"}
                        </span>
                      </div>
                    )}
                    <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-1.5 leading-relaxed">
                      โควตาสำหรับส่งข้อความ Flex Message รายเดือนของคุณ
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadLineQuota(true)}
                  disabled={fetchingQuota}
                  className="p-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-xl text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${fetchingQuota ? "animate-spin" : ""}`} />
                </button>
              </div>

              {quotaData ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">ส่งไปแล้ว</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.consumed.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">คงเหลือ</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.remaining.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">ข้อความ</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
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
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden border border-slate-200/50 dark:border-slate-800/35">
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
                        <span className="bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">แคชระบบ</span>
                      ) : (
                        <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 text-[10px] font-bold uppercase tracking-wider">อัปเดตสด</span>
                      )}
                      <span>
                        แหล่งที่มา:{" "}
                        <span className="text-slate-700 dark:text-slate-300 font-extrabold uppercase tracking-wide">
                          {quotaData.source === "api" 
                            ? "LINE API" 
                            : quotaData.source === "database" 
                            ? "database" 
                            : quotaData.source === "database_legacy" 
                            ? "database (legacy)" 
                            : quotaData.source === "memory" 
                            ? "memory cache" 
                            : quotaData.source === "demo" 
                            ? "LINE API (Demo)" 
                            : quotaData.source}
                        </span>
                      </span>
                    </span>
                    <span>
                      ล่าสุด:{" "}
                      {(() => {
                        try {
                          const date = new Date(quotaData.updated_at);
                          return isNaN(date.getTime()) 
                            ? "--:--:--" 
                            : date.toLocaleTimeString("th-TH", { hour12: false });
                        } catch (e) {
                          return "--:--:--";
                        }
                      })()}{" "}
                      น.
                    </span>
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
        {showManual && (
          <div className="space-y-6">
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                      คู่มือเชื่อมต่อระบบ LINE OA ส่วนตัว
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      ขั้นตอนรับสิทธิ์ส่งบิลและลงทะเบียนผู้เช่าแบบแยกหอพักอิสระ
                    </p>
                  </div>
                </div>
                
                {/* Master expand/collapse button */}
                <button
                  type="button"
                  onClick={() => {
                    const allOpen = openStep1 && openStep2 && openStep3 && openWarnings;
                    setOpenStep1(!allOpen);
                    setOpenStep2(!allOpen);
                    setOpenStep3(!allOpen);
                    setOpenWarnings(!allOpen);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                >
                  {openStep1 && openStep2 && openStep3 && openWarnings ? "ยุบทั้งหมด" : "ขยายทั้งหมด"}
                </button>
              </div>

              {/* Instruction Steps List */}
              <div className="space-y-4 text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                
                {/* Step 1 Accordion */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep1(!openStep1)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        1
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ สร้าง Provider สำหรับหอพัก</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep1 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep1 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        เข้าสู่เว็บ <span className="font-bold text-slate-800 dark:text-slate-100">LINE Developers Console</span> สมัครบัญชีผู้พัฒนา
                      </p>
                      <div className="py-1">
                        <a 
                          href="https://developers.line.biz" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-blue-500/10"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>เข้าสู่ LINE Developers Console 🌐</span>
                        </a>
                      </div>
                      <p className="leading-relaxed">
                        กดปุ่ม <strong className="font-extrabold text-slate-800 dark:text-slate-200">Create Provider</strong> (ตั้งชื่อโฟลเดอร์เป็นชื่อหอพักของคุณ เพื่อความเป็นสัดส่วน)
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 2 Accordion */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep2(!openStep2)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        2
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ สร้างระบบส่งแจ้งเตือน (Messaging API)</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep2 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep2 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        กดเข้า Provider ที่พึ่งสร้าง กดสร้าง Channel ใหม่ เลือกหัวข้อ <strong className="font-extrabold text-slate-800 dark:text-slate-200">Messaging API</strong>
                      </p>
                      <p className="leading-relaxed">
                        กรอกข้อมูลของบอทหอพักคุณให้เสร็จ
                      </p>
                      
                      <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-3.5 my-2.5 shadow-inner">
                        <p className="font-extrabold text-emerald-650 dark:text-emerald-400 text-xs sm:text-sm leading-normal">
                          💡 หากท่านมี Line OA ที่ใช้งานอยู่แล้ว เริ่มที่ขั้นตอนนี้ได้เลย:
                        </p>
                        <div className="py-1">
                          <a 
                            href="https://manager.line.biz" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>เข้าสู่ LINE Official Account Manager 🟢</span>
                          </a>
                        </div>
                        <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 space-y-2.5 font-medium pl-1">
                          <div>• เข้าสู่ระบบและเลือก <span className="font-extrabold text-slate-800 dark:text-slate-200">Line OA ของท่าน</span></div>
                          <div>• เลื่อนแถบด้านบนฝั่งขวาชื่อ <span className="font-extrabold text-slate-800 dark:text-slate-200">"ตั้งค่า"</span></div>
                          <div>• ไปที่หัวข้อด้านบนชื่อ <span className="font-extrabold text-slate-800 dark:text-slate-200">Messaging API</span></div>
                          <div>• กดปุ่ม <span className="font-extrabold text-slate-800 dark:text-slate-100">"ใช้ Messaging API"</span></div>
                          <div>• เลือก Provider ของท่าน และกดยอมรับ</div>
                          <div>• กลับมาที่หน้า LINE Developers Console อีกรอบ เลือก Provider ของท่าน</div>
                          <div>• จะมี Messaging API พร้อมชื่อ Line OA ของท่านแสดงขึ้นมา <span className="font-extrabold text-slate-800 dark:text-slate-200">กดเข้าไปที่ชื่อ Line OA ของท่าน</span></div>
                        </div>
                      </div>

                      <p className="leading-relaxed">
                        เลื่อนแถบไปที่หัวข้อด้านบนชื่อ <strong className="font-extrabold text-slate-800 dark:text-slate-200">Messaging API</strong>
                      </p>
                      <p className="leading-relaxed">
                        เลื่อนลงไปด้านล่างสุดหัวข้อ <strong className="font-extrabold text-slate-800 dark:text-slate-200">Channel access token (long-lived)</strong>
                      </p>
                      <p className="leading-relaxed">
                        กดปุ่ม <strong className="font-extrabold text-slate-800 dark:text-slate-200">Issue</strong> คัดลอกรหัสความปลอดภัยยาว ๆ มากรอกในช่องด้านซ้ายของหน้านี้
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 3 Accordion */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenStep3(!openStep3)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xs font-black border border-blue-500/20">
                        3
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ สร้างหน้ายืนยันสิทธิ์ (LINE Login & LIFF)</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep3 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep3 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        กดเข้า Provider ที่พึ่งสร้าง กด <strong className="font-extrabold text-slate-800 dark:text-slate-100">Create New Channel</strong> เลือกหัวข้อ <strong className="font-extrabold text-slate-800 dark:text-slate-100">LINE Login</strong>
                      </p>
                      <p className="leading-relaxed">
                        ตั้งค่าตามที่กำหนด:
                      </p>
                      
                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2.5 font-mono shadow-inner leading-relaxed text-slate-700 dark:text-slate-300">
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Region to provide the service</span> = Thailand</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Company or owner's country or region</span> = Thailand</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Channel name</span> = สามารถตั้งชื่อได้ตามที่ท่านต้องการ</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Channel description</span> = สามารถระบุได้ตามที่ท่านต้องการ</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">App types</span> = Web app</div>
                      </div>

                      <p className="leading-relaxed">
                        กด <strong className="font-extrabold text-slate-800 dark:text-slate-100">I agree to the LINE Developers Agreement.</strong>
                      </p>
                      <p className="leading-relaxed">
                        กด <strong className="font-extrabold text-slate-800 dark:text-slate-100">I have read and acknowledge LY Corporation Privacy Policy.</strong> และกด <strong className="font-extrabold text-slate-800 dark:text-slate-100">Create</strong>
                      </p>
                      <p className="leading-relaxed">
                        ไปที่แท็บด้านบนชื่อ <strong className="font-extrabold text-slate-800 dark:text-slate-100">LIFF</strong> กด <strong className="font-extrabold text-slate-800 dark:text-slate-100">Add</strong>
                      </p>
                      <p className="leading-relaxed">
                        ตั้งค่าตามที่กำหนด:
                      </p>

                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2.5 font-mono shadow-inner leading-relaxed text-slate-700 dark:text-slate-300">
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">LIFF app name</span> = สามารถตั้งชื่อได้ตามที่ท่านต้องการ</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Size</span> = full</div>
                        <div className="space-y-2 border-y border-slate-200/50 dark:border-slate-800/60 py-2.5 my-1">
                          <div className="flex items-center gap-1.5 font-semibold">• <span className="text-blue-600 dark:text-blue-400 font-bold">Endpoint URL</span> = https://saas-horset.vercel.app/tenant-register</div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
                            <span className="flex-1 p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-blue-600 dark:text-blue-400 text-[11px] select-all break-all leading-normal font-mono">
                              https://saas-horset.vercel.app/tenant-register
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyEndpoint}
                              className={`shrink-0 px-3.5 py-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                copiedEndpoint 
                                  ? "bg-green-500/10 text-green-500 border-green-500/20 shadow-sm" 
                                  : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-450 border-blue-500/15 shadow-sm"
                              }`}
                            >
                              {copiedEndpoint ? <Check className="w-3.5 h-3.5 animate-bounce" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedEndpoint ? "คัดลอกแล้ว!" : "คัดลอกลิงก์"}</span>
                            </button>
                          </div>
                        </div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Scopes</span> = profile</div>
                        <div>• <span className="text-blue-600 dark:text-blue-400 font-bold">Add friend option</span> = Off</div>
                      </div>

                      <p className="leading-relaxed">
                        กดปุ่ม <strong className="font-extrabold text-slate-800 dark:text-slate-100">Add</strong> ด้านล่างสุด
                      </p>
                      <p className="leading-relaxed">
                        คัดลอกรหัส <strong className="font-extrabold text-slate-800 dark:text-slate-100">LIFF ID</strong> มากรอกในช่องด้านซ้าย แล้วกดปุ่มบันทึกการตั้งค่า
                      </p>
                    </div>
                  )}
                </div>

                {/* Crucial Warnings Accordion */}
                <div className="border border-rose-200 dark:border-rose-900/40 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-rose-500/[0.01] dark:bg-rose-950/[0.04]">
                  <button
                    type="button"
                    onClick={() => setOpenWarnings(!openWarnings)}
                    className="w-full flex items-center justify-between p-4 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-500/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                      <span className="font-extrabold text-rose-700 dark:text-rose-400 text-sm md:text-base">ข้อควรระวังสำคัญที่สุด (ป้องกันระบบทำงานล้มเหลว)</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-rose-400 transition-transform duration-300 ${openWarnings ? "rotate-180" : ""}`} />
                  </button>

                  {openWarnings && (
                    <div className="p-5 bg-transparent border-t border-rose-200/30 dark:border-rose-900/20 space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium animate-fadeIn">
                      
                      {/* Warning 1 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          1. ต้องเผยแพร่สถานะ LINE Login เสมอ (เปลี่ยนเป็น "Published")
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          เมื่อเริ่มสร้าง LINE Login ระบบจะตั้งสถานะเริ่มต้นเป็น <strong className="text-slate-700 dark:text-slate-300 font-bold">Developing (สีเทา)</strong> ทำให้เฉพาะตัวแอดมินเท่านั้นที่ใช้งานลิงก์ได้ แต่ผู้เช่าทั่วไปจะเจอปัญหากดสมัครไม่ได้หรือหน้าจอลูปหมุนวนไม่หยุด <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold">วิธีแก้:</strong> คลิกที่แถบสถานะกลม ๆ สีเทามุมขวาบนของหน้า LINE Login ให้เปลี่ยนเป็นสถานะ <strong className="text-emerald-650 dark:text-emerald-400 font-extrabold">Published (สีเขียว)</strong> ก่อนใช้งานจริง
                        </p>
                      </div>

                      {/* Warning 2 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          2. Endpoint URL ของ LIFF ต้องมีสแลช "/tenant-register" เสมอ
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          ตรวจสอบว่าในช่อง Endpoint URL ตอนลงทะเบียน LIFF มีค่าต่อท้ายครบถ้วน ไม่เป็นเพียงชื่อโดเมนเปล่า ๆ มิฉะนั้นผู้เช่าที่กดลิงก์มาจะหาข้อมูลห้องพักไม่เจอและจะขึ้นแจ้งเตือน <strong className="text-rose-500 font-bold">"ไม่ระบุข้อมูลห้องพัก"</strong> ป้องกันการยืนยันข้อมูล
                        </p>
                      </div>

                      {/* Warning 3 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          3. วิธีส่งต่อลิงก์ลงทะเบียนที่ถูกต้อง
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          เมื่อแอดมินคลิกปุ่ม <strong className="text-slate-700 dark:text-slate-300 font-bold">"เจนลิงก์ LINE"</strong> ให้ทำการกดปุ่ม <strong className="text-slate-700 dark:text-slate-300 font-bold">"คัดลอกลิงก์"</strong> แล้วส่งให้ผู้เช่าตรง ๆ ทางแชททันที <strong className="text-rose-500 font-bold">ห้ามแอดมินกดเปิดลิงก์ทดสอบก่อนแล้วไปก๊อปปี้ URL บนเว็บเบราว์เซอร์ส่งให้ผู้เช่าเด็ดขาด</strong> เพราะข้อมูลตัวตนของหอพักและหมายเลขห้องพักจะสูญหายทันที
                        </p>
                      </div>

                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
