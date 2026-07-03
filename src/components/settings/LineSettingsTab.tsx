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
  ChevronUp,
  Bell,
  BellOff,
  Users,
  Plus,
  Trash2,
  X
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { getLineProfilesAction, generateAdminConnectionCodeAction } from "@/features/notification/actions"

export default function LineSettingsTab() {
  const [profileLoading, setProfileLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  
  // Settings Inputs
  const [tokenInput, setTokenInput] = useState("")
  const [liffInput, setLiffInput] = useState("")
  const [secretInput, setSecretInput] = useState("")
  const [adminUserIdInput, setAdminUserIdInput] = useState("")
  const [adminGroupIdInput, setAdminGroupIdInput] = useState("")
  const [adminNotificationActive, setAdminNotificationActive] = useState(true)
  
  // Password Visibility
  const [showToken, setShowToken] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  
  // Action status
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null)
  const [isConfigured, setIsConfigured] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  
  // Saved States (for Cancel comparison)
  const [savedToken, setSavedToken] = useState("")
  const [savedLiff, setSavedLiff] = useState("")
  const [savedSecret, setSavedSecret] = useState("")
  const [savedAdminUserId, setSavedAdminUserId] = useState("")
  const [savedAdminGroupId, setSavedAdminGroupId] = useState("")
  const [savedAdminNotificationActive, setSavedAdminNotificationActive] = useState(true)
  const [disabledAdminUserIdsInput, setDisabledAdminUserIdsInput] = useState("")
  const [savedDisabledAdminUserIds, setSavedDisabledAdminUserIds] = useState("")
  
  // Admin LINE Profiles
  const [adminProfiles, setAdminProfiles] = useState<any[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  
  // Add LINE Admin Connection Modal States
  const [showAddModal, setShowAddModal] = useState(false)
  const [newUidInput, setNewUidInput] = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [modalProfilePreview, setModalProfilePreview] = useState<any | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  
  // Automated pairing states
  const [pairingTab, setPairingTab] = useState<"auto" | "manual">("auto")
  const [connectionCode, setConnectionCode] = useState<string | null>(null)
  const [codeExpiresAt, setCodeExpiresAt] = useState<string | null>(null)
  const [codeCountdown, setCodeCountdown] = useState(300)
  const [isGeneratingCode, setIsGeneratingCode] = useState(false)
  
  // Quota Status
  const [fetchingQuota, setFetchingQuota] = useState(false)
  const [quotaData, setQuotaData] = useState<any>(null)
  const [quotaError, setQuotaError] = useState<string | null>(null)
  
  // Interactive Manual & Utility states
  const [showManual, setShowManual] = useState(true)
  const [copiedEndpoint, setCopiedEndpoint] = useState(false)
  const [copiedWebhook, setCopiedWebhook] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  
  const [openStep1, setOpenStep1] = useState(true)
  const [openStep2, setOpenStep2] = useState(true)
  const [openStep3, setOpenStep3] = useState(true)
  const [openWarnings, setOpenWarnings] = useState(true)

  const [openSubStep1, setOpenSubStep1] = useState(true)
  const [openSubStep2, setOpenSubStep2] = useState(true)
  const [openSubStep3, setOpenSubStep3] = useState(true)
  const [openSubStep4, setOpenSubStep4] = useState(true)

  const isDemo = !process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL.includes("localhost") && !process.env.NEXT_PUBLIC_SUPABASE_URL

  const [activeCodesList, setActiveCodesList] = useState<Array<{ code: string; expires_at: string }>>([])
  const [isLoadingActiveCodes, setIsLoadingActiveCodes] = useState(false)
  const [ticker, setTicker] = useState(0)

  const loadActiveCodesList = async (wsId: string) => {
    if (!wsId || isDemo) return
    setIsLoadingActiveCodes(true)
    try {
      const supabase = createClient()
      
      // 1. Delete expired or used ones first (และทำให้ Code ไหนหมดอายุหรือใช้แล้วลบออกจาก supabase เลย)
      await supabase
        .from("admin_connection_codes")
        .delete()
        .eq("workspace_id", wsId)
        .or(`expires_at.lt.${new Date().toISOString()},is_used.eq.true`)

      // 2. Fetch the remaining unused, non-expired ones
      const { data, error } = await supabase
        .from("admin_connection_codes")
        .select("code, expires_at")
        .eq("workspace_id", wsId)
        .eq("is_used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })

      if (error) throw error

      setActiveCodesList(data || [])
      
      // Set the main active connectionCode to the most recent one if available
      if (data && data.length > 0) {
        setConnectionCode(data[0].code)
        setCodeExpiresAt(data[0].expires_at)
      } else {
        setConnectionCode(null)
        setCodeExpiresAt(null)
      }
    } catch (err) {
      console.warn("Error loading active connection codes:", err)
    } finally {
      setIsLoadingActiveCodes(false)
    }
  }

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
            setSecretInput(data.channel_secret || "")
            setAdminUserIdInput(data.admin_line_user_id || "")
            setAdminGroupIdInput(data.admin_line_group_id || "")
            setDisabledAdminUserIdsInput(data.disabled_admin_line_user_ids || "")
            setSavedDisabledAdminUserIds(data.disabled_admin_line_user_ids || "")
            
            setSavedToken(data.channel_access_token || "")
            setSavedLiff(data.liff_id || "")
            setSavedSecret(data.channel_secret || "")
            setSavedAdminUserId(data.admin_line_user_id || "")
            setSavedAdminGroupId(data.admin_line_group_id || "")
            setAdminNotificationActive(data.admin_notification_active !== false)
            setSavedAdminNotificationActive(data.admin_notification_active !== false)
            setIsConfigured(!!data.channel_access_token)

            if (data.admin_line_user_id && wsId) {
              loadAdminProfiles(data.admin_line_user_id, wsId)
            }

            // Check for active connection code on load & clean up expired ones
            await loadActiveCodesList(wsId)
            
            // Set initial quota display from cache row
            if (data.limit_count !== null && data.limit_count !== undefined) {
              setQuotaData({
                limit: data.limit_count,
                consumed: data.consumed_count,
                remaining: data.remaining_count,
                percentage_used: data.percentage_used,
                displayName: data.bot_name || "LINE OA ของหอพัก",
                basicId: data.bot_basic_id || "@line_oa",
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
          setSecretInput("0ca9550dc4ec7ce043831d47e18154bf")
          setAdminUserIdInput("U123456789abcdef0123456789abcdef0")
          setAdminGroupIdInput("C123456789abcdef0123456789abcdef0")
          
          setSavedToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo_token_apartment_owner")
          setSavedLiff("2010442620-H4josaDy")
          setSavedSecret("0ca9550dc4ec7ce043831d47e18154bf")
          setSavedAdminUserId("U123456789abcdef0123456789abcdef0")
          setSavedAdminGroupId("C123456789abcdef0123456789abcdef0")
          setIsConfigured(true)
          loadAdminProfiles("U123456789abcdef0123456789abcdef0", "d290f1ee-6c54-4b01-90e6-d701748f0851")
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

  const loadAdminProfiles = async (userIdsStr: string, wsId: string) => {
    if (!userIdsStr || !userIdsStr.trim() || !wsId) {
      setAdminProfiles([])
      return
    }
    setLoadingProfiles(true)
    try {
      if (isDemo) {
        const ids = userIdsStr.split(/[\s,\n]+/).map(id => id.trim()).filter(id => id.length > 0).slice(0, 5)
        setAdminProfiles(ids.map((id, index) => ({
          userId: id,
          displayName: `แอดมินจำลองท่านที่ ${index + 1}`,
          pictureUrl: null,
          success: true
        })))
        return
      }
      const res = await getLineProfilesAction(userIdsStr, wsId)
      if (res.success && res.data) {
        setAdminProfiles(res.data)
      } else {
        console.error("Failed to fetch admin profiles:", res.error)
      }
    } catch (err) {
      console.error("Exception loading admin profiles:", err)
    } finally {
      setLoadingProfiles(false)
    }
  }

  const handleOpenAddModal = () => {
    if (adminProfiles.length >= 5) {
      alert("ขออภัย! ระบบรองรับแอดมินแจ้งเตือนสูงสุดได้ 5 คน")
      return
    }
    setNewUidInput("")
    setModalProfilePreview(null)
    setModalError(null)
    setPairingTab("auto")
    setConnectionCode(null)
    setCodeExpiresAt(null)
    setShowAddModal(true)
  }

  const handleCloseAddModal = () => {
    setConnectionCode(null)
    setCodeExpiresAt(null)
    setShowAddModal(false)
  }

  // Countdown Timer for 5-minute connection code
  useEffect(() => {
    if (!codeExpiresAt || !connectionCode) return

    const calculateTimeLeft = () => {
      const difference = +new Date(codeExpiresAt) - +new Date()
      return difference > 0 ? Math.floor(difference / 1000) : 0
    }

    setCodeCountdown(calculateTimeLeft())

    const timer = setInterval(() => {
      const left = calculateTimeLeft()
      setCodeCountdown(left)
      if (left <= 0) {
        setConnectionCode(null)
        setCodeExpiresAt(null)
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [codeExpiresAt, connectionCode])

  // Real-time Polling for automated code usage
  useEffect(() => {
    if (!connectionCode) return

    let isSubscribed = true
    const interval = setInterval(async () => {
      if (!workspaceId) return

      try {
        const supabase = createClient()
        const { data: codeData } = await supabase
          .from("admin_connection_codes")
          .select("is_used")
          .eq("code", connectionCode)
          .maybeSingle()

        if (codeData && codeData.is_used && isSubscribed) {
          clearInterval(interval)
          
          // Re-fetch workspace settings to load newly added admin profiles
          const { data: wsSettings } = await supabase
            .from("workspace_line_settings")
            .select("admin_line_user_id, disabled_admin_line_user_ids")
            .eq("workspace_id", workspaceId)
            .maybeSingle()

          if (wsSettings) {
            setAdminUserIdInput(wsSettings.admin_line_user_id || "")
            setSavedAdminUserId(wsSettings.admin_line_user_id || "")
            setDisabledAdminUserIdsInput(wsSettings.disabled_admin_line_user_ids || "")
            setSavedDisabledAdminUserIds(wsSettings.disabled_admin_line_user_ids || "")
            await loadAdminProfiles(wsSettings.admin_line_user_id || "", workspaceId)
            await loadActiveCodesList(workspaceId)
          }

          setSettingsSuccess("🎉 ผูกบัญชี LINE Admin อัตโนมัติสำเร็จเรียบร้อยแล้ว!")
          setConnectionCode(null)
          setCodeExpiresAt(null)
          setShowAddModal(false)
        }
      } catch (err) {
        console.error("Error polling connection code status:", err)
      }
    }, 2500)

    return () => {
      isSubscribed = false
      clearInterval(interval)
    }
  }, [connectionCode, workspaceId])

  const handleGenerateConnectionCode = async () => {
    if (!workspaceId) return
    setIsGeneratingCode(true)
    setModalError(null)
    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 600))
        setConnectionCode("123456")
        setCodeExpiresAt(new Date(Date.now() + 5 * 60 * 1000).toISOString())
        return
      }

      const res = await generateAdminConnectionCodeAction(workspaceId)
      if (res.success && res.code && res.expiresAt) {
        setConnectionCode(res.code)
        setCodeExpiresAt(res.expiresAt)
        await loadActiveCodesList(workspaceId)
      } else {
        setModalError(res.error || "เกิดข้อผิดพลาดในการสร้างรหัส")
      }
    } catch (err: any) {
      console.error("Error generating pairing code:", err)
      setModalError(err.message || "เกิดข้อผิดพลาดทางเทคนิค")
    } finally {
      setIsGeneratingCode(false)
    }
  }

  const handleLookupProfile = async () => {
    const trimmedUid = newUidInput.trim()
    if (!trimmedUid) {
      setModalError("กรุณาระบุ LINE User ID ของแอดมินก่อน")
      return
    }
    if (!trimmedUid.startsWith("U") || trimmedUid.length !== 33) {
      setModalError("รูปแบบรหัสไม่ถูกต้อง (ต้องขึ้นต้นด้วยอักษร U และมีความยาว 33 ตัวอักษร)")
      return
    }
    if (adminProfiles.some((p: any) => p.userId === trimmedUid)) {
      setModalError("LINE User ID นี้ได้รับการเพิ่มเชื่อมต่อแอดมินอยู่แล้ว")
      return
    }

    setModalLoading(true)
    setModalError(null)
    setModalProfilePreview(null)

    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 800))
        setModalProfilePreview({
          userId: trimmedUid,
          displayName: "แอดมินจำลอง (จากการสืบค้นเดโม)",
          pictureUrl: null,
          success: true
        })
        return
      }

      const res = await getLineProfilesAction(trimmedUid, workspaceId || "d290f1ee-6c54-4b01-90e6-d701748f0851")
      if (res.success && res.data && res.data.length > 0) {
        const profile = res.data[0]
        setModalProfilePreview(profile)
      } else {
        setModalError(res.error || "ไม่สามารถค้นหาข้อมูลผู้ใช้ได้ (กรุณาเพิ่มเพื่อนบอทและตรวจสอบ ID)")
      }
    } catch (err: any) {
      console.error("Error looking up profile:", err)
      setModalError(err.message || "เกิดข้อผิดพลาดในการตรวจสอบโปรไฟล์")
    } finally {
      setModalLoading(false)
    }
  }

  const handleConfirmAddAdmin = () => {
    if (!modalProfilePreview) return
    
    const updatedProfiles = [...adminProfiles, modalProfilePreview]
    setAdminProfiles(updatedProfiles)
    
    const updatedUidsStr = updatedProfiles.map((p: any) => p.userId).join(",")
    setAdminUserIdInput(updatedUidsStr)
    
    setShowAddModal(false)
  }

  const handleDeleteAdmin = (uidToDelete: string) => {
    const updatedProfiles = adminProfiles.filter((p: any) => p.userId !== uidToDelete)
    setAdminProfiles(updatedProfiles)
    const updatedUidsStr = updatedProfiles.map((p: any) => p.userId).join(",")
    setAdminUserIdInput(updatedUidsStr)

    // Clean up disabled list
    const disabledList = disabledAdminUserIdsInput
      ? disabledAdminUserIdsInput.split(/[\s,\n]+/).map(id => id.trim()).filter(id => id.length > 0)
      : []
    const updatedDisabledList = disabledList.filter(id => id !== uidToDelete)
    const updatedDisabledStr = updatedDisabledList.join(",")
    setDisabledAdminUserIdsInput(updatedDisabledStr)
    setSavedDisabledAdminUserIds(updatedDisabledStr)
  }

  // Tick timer to update all active connection codes countdowns in real-time
  useEffect(() => {
    if (activeCodesList.length === 0) return

    const timer = setInterval(() => {
      setTicker(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [activeCodesList])

  const handleDeleteConnectionCode = async (codeToDelete: string) => {
    if (!codeToDelete || !workspaceId) return
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการยกเลิกและลบรหัสเชื่อมต่อ "${codeToDelete}" นี้ออกจากระบบ?`)) return

    setModalLoading(true)
    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setActiveCodesList(prev => prev.filter(c => c.code !== codeToDelete))
        if (connectionCode === codeToDelete) {
          setConnectionCode(null)
          setCodeExpiresAt(null)
        }
        setSettingsSuccess("ยกเลิกรหัสเชื่อมต่อสำเร็จ (Demo)")
        return
      }

      const supabase = createClient()
      const { error } = await supabase
        .from("admin_connection_codes")
        .delete()
        .eq("code", codeToDelete)
        .eq("workspace_id", workspaceId)

      if (error) throw error

      setSettingsSuccess(`ยกเลิกรหัสเชื่อมต่อ "${codeToDelete}" สำเร็จเรียบร้อยแล้ว!`)
      
      // Refresh active codes list
      await loadActiveCodesList(workspaceId)
    } catch (err: any) {
      console.error("Error canceling connection code:", err)
      setSettingsError(err.message || "เกิดข้อผิดพลาดในการยกเลิกรหัส")
    } finally {
      setModalLoading(false)
    }
  }

  const handleCancelConnectionCode = async () => {
    if (!connectionCode) return
    await handleDeleteConnectionCode(connectionCode)
  }

  const handleToggleIndividualAdminNotification = async (uid: string) => {
    if (!workspaceId) return

    const disabledList = disabledAdminUserIdsInput
      ? disabledAdminUserIdsInput.split(/[\s,\n]+/).map(id => id.trim()).filter(id => id.length > 0)
      : []

    let newDisabledList: string[]
    if (disabledList.includes(uid)) {
      newDisabledList = disabledList.filter(id => id !== uid)
    } else {
      newDisabledList = [...disabledList, uid]
    }

    const newDisabledStr = newDisabledList.join(",")
    
    setDisabledAdminUserIdsInput(newDisabledStr)
    setSavedDisabledAdminUserIds(newDisabledStr)

    setSavingSettings(true)
    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setSettingsSuccess("อัปเดตการรับแจ้งเตือนสำหรับแอดมินคนนี้สำเร็จ (Demo)!")
        return
      }

      const supabase = createClient()
      const { error } = await supabase
        .from("workspace_line_settings")
        .update({
          disabled_admin_line_user_ids: newDisabledStr || null,
          updated_at: new Date().toISOString()
        })
        .eq("workspace_id", workspaceId)

      if (error) throw error

      setSettingsSuccess("อัปเดตการรับแจ้งเตือนสำหรับแอดมินสำเร็จเรียบร้อยแล้ว!")
    } catch (err: any) {
      console.error("Error toggling individual admin notification:", err)
      setDisabledAdminUserIdsInput(savedDisabledAdminUserIds)
    } finally {
      setSavingSettings(false)
    }
  }


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

  const handleToggleAdminNotification = async () => {
    const nextState = !adminNotificationActive
    
    // If currently editing the whole form, just update local state (the parent form submit will save it)
    if (isEditing) {
      setAdminNotificationActive(nextState)
      return
    }

    // Otherwise, save the toggle state instantly to the database!
    if (!workspaceId) return
    
    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(null)
    setAdminNotificationActive(nextState) // Optimistically update state

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      setSavedAdminNotificationActive(nextState)
      setSettingsSuccess(`อัปเดตสถานะแจ้งเตือนแอดมินเป็น ${nextState ? "เปิด" : "ปิด"} (Demo) สำเร็จ!`)
      setSavingSettings(false)
      return
    }

    try {
      const supabase = createClient()
      
      const { data: existingRow, error: checkErr } = await supabase
        .from("workspace_line_settings")
        .select("workspace_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

      if (checkErr) throw checkErr

      let dbError = null
      if (existingRow) {
        const { error: updateErr } = await supabase
          .from("workspace_line_settings")
          .update({
            admin_notification_active: nextState,
            updated_at: new Date().toISOString()
          })
          .eq("workspace_id", workspaceId)
        dbError = updateErr
      } else {
        const { error: insertErr } = await supabase
          .from("workspace_line_settings")
          .insert({
            workspace_id: workspaceId,
            admin_notification_active: nextState,
            limit_count: 1000,
            consumed_count: 0,
            remaining_count: 1000,
            percentage_used: 0,
            updated_at: new Date().toISOString()
          })
        dbError = insertErr
      }

      if (dbError) throw dbError

      setSavedAdminNotificationActive(nextState)
      setSettingsSuccess(`อัปเดตสถานะแจ้งเตือนแอดมินเป็น ${nextState ? "เปิด" : "ปิด"} เรียบร้อยแล้ว!`)
    } catch (err: any) {
      console.error("Error toggling admin notification:", err)
      setAdminNotificationActive(adminNotificationActive) // Revert state
      
      if (err.message && (
        err.message.includes("column") ||
        err.message.includes("admin_notification_active")
      )) {
        setSettingsError(
          "⚠️ ไม่สามารถบันทึกสถานะได้เนื่องจากฐานข้อมูลตาราง 'workspace_line_settings' ยังไม่ได้รันสคริปต์ SQL Patch!"
        )
      } else {
        setSettingsError(err.message || "เกิดข้อผิดพลาดในการเปลี่ยนสถานะการแจ้งเตือน")
      }
    } finally {
      setSavingSettings(false)
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
    const trimmedSecret = secretInput.trim()
    const trimmedAdminUserId = adminUserIdInput.trim()
    const trimmedAdminGroupId = adminGroupIdInput.trim()

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      setIsConfigured(!!trimmedToken)
      setSavedToken(trimmedToken)
      setSavedLiff(trimmedLiff)
      setSavedSecret(trimmedSecret)
      setSavedAdminUserId(trimmedAdminUserId)
      setSavedAdminGroupId(trimmedAdminGroupId)
      setSavedAdminNotificationActive(adminNotificationActive)
      setIsEditing(false)
      setSettingsSuccess("บันทึกการเชื่อมต่อจำลองสำเร็จ!")
      if (trimmedAdminUserId) {
        loadAdminProfiles(trimmedAdminUserId, workspaceId || "d290f1ee-6c54-4b01-90e6-d701748f0851")
      } else {
        setAdminProfiles([])
      }
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
            channel_secret: trimmedSecret || null,
            admin_line_user_id: trimmedAdminUserId || null,
            admin_line_group_id: trimmedAdminGroupId || null,
            admin_notification_active: adminNotificationActive,
            disabled_admin_line_user_ids: disabledAdminUserIdsInput || null,
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
            channel_secret: trimmedSecret || null,
            admin_line_user_id: trimmedAdminUserId || null,
            admin_line_group_id: trimmedAdminGroupId || null,
            admin_notification_active: adminNotificationActive,
            disabled_admin_line_user_ids: disabledAdminUserIdsInput || null,
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
      setSavedSecret(trimmedSecret)
      setSavedAdminUserId(trimmedAdminUserId)
      setSavedAdminGroupId(trimmedAdminGroupId)
      setSavedAdminNotificationActive(adminNotificationActive)
      setIsEditing(false)
      setSettingsSuccess("บันทึกข้อมูลการเชื่อมต่อ LINE OA สำเร็จ!")
      
      // Reload admin LINE profiles
      if (trimmedAdminUserId && workspaceId) {
        loadAdminProfiles(trimmedAdminUserId, workspaceId)
      } else {
        setAdminProfiles([])
      }

      // Trigger a live quota reload
      if (trimmedToken) {
        loadLineQuota(true)
      }
    } catch (err: any) {
      console.error("Error saving LINE settings:", err)
      
      // Smart detection of database missing columns error
      if (err.message && (
        (err.message.includes("column") && err.message.includes("does not exist")) ||
        err.message.includes("admin_line_user_id") ||
        err.message.includes("admin_line_group_id") ||
        err.message.includes("channel_secret") ||
        err.message.includes("admin_notification_active")
      )) {
        setSettingsError(
          "⚠️ ระบบหลังบ้านตรวจพบว่าตาราง 'workspace_line_settings' ยังไม่ได้เพิ่มฟิลด์ใหม่สำหรับแจ้งเตือนแอดมิน\n\nกรุณาแจ้งให้ผู้ดูแลระบบ (Admin) รันไฟล์ SQL Patch 'database_patch_toggle_admin_notifications.sql' ในหน้า Supabase Dashboard SQL Editor เพื่อเตรียมพร้อมตารางก่อน!"
        )
      } else {
        setSettingsError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูลตั้งค่า")
      }
    } finally {
      setSavingSettings(false)
    }
  }

  const handleCancelEdit = () => {
    setTokenInput(savedToken)
    setLiffInput(savedLiff)
    setSecretInput(savedSecret)
    setAdminUserIdInput(savedAdminUserId)
    setAdminGroupIdInput(savedAdminGroupId)
    setAdminNotificationActive(savedAdminNotificationActive)
    setDisabledAdminUserIdsInput(savedDisabledAdminUserIds)
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
      setSecretInput("")
      setAdminUserIdInput("")
      setAdminGroupIdInput("")
      setAdminNotificationActive(true)
      setSavedToken("")
      setSavedLiff("")
      setSavedSecret("")
      setSavedAdminUserId("")
      setSavedAdminGroupId("")
      setSavedAdminNotificationActive(true)
      setIsConfigured(false)
      setIsEditing(false)
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
          channel_secret: null,
          admin_line_user_id: null,
          admin_line_group_id: null,
          admin_notification_active: true,
          updated_at: new Date().toISOString()
        })
        .eq("workspace_id", workspaceId)

      if (error) throw error

      setTokenInput("")
      setLiffInput("")
      setSecretInput("")
      setAdminUserIdInput("")
      setAdminGroupIdInput("")
      setAdminNotificationActive(true)
      setSavedToken("")
      setSavedLiff("")
      setSavedSecret("")
      setSavedAdminUserId("")
      setSavedAdminGroupId("")
      setSavedAdminNotificationActive(true)
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

  const handleClearGroupId = async () => {
    if (!workspaceId) return
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการยกเลิกการเชื่อมต่อกับกลุ่ม LINE ปัจจุบัน? ระบบจะหยุดส่งข้อความแจ้งเตือนสลิปเข้ากลุ่มไลน์ทีมงานทันที")) return

    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(null)

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      setAdminGroupIdInput("")
      setSavedAdminGroupId("")
      setSettingsSuccess("ยกเลิกการเชื่อมต่อกลุ่ม LINE จำลองสำเร็จ!")
      setSavingSettings(false)
      return
    }

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("workspace_line_settings")
        .update({
          admin_line_group_id: null,
          updated_at: new Date().toISOString()
        })
        .eq("workspace_id", workspaceId)

      if (error) throw error

      setAdminGroupIdInput("")
      setSavedAdminGroupId("")
      setSettingsSuccess("ยกเลิกการเชื่อมต่อกลุ่ม LINE สำเร็จ!")
    } catch (err: any) {
      console.error("Error clearing group ID:", err)
      setSettingsError(err.message || "เกิดข้อผิดพลาดในการยกเลิกการเชื่อมต่อกลุ่ม LINE")
    } finally {
      setSavingSettings(false)
    }
  }

  const handleCopyEndpoint = () => {
    if (typeof window !== "undefined") {
      const endpoint = `${window.location.origin}/tenant-register`
      navigator.clipboard.writeText(endpoint)
      setCopiedEndpoint(true)
      setTimeout(() => setCopiedEndpoint(false), 2000)
    }
  }

  const handleCopyWebhook = () => {
    if (typeof window !== "undefined" && workspaceId) {
      const webhook = `${window.location.origin}/api/webhook/line?workspace_id=${workspaceId}`
      navigator.clipboard.writeText(webhook)
      setCopiedWebhook(true)
      setTimeout(() => setCopiedWebhook(false), 2000)
    }
  }

  const handleCopyConnectionCode = () => {
    if (typeof window !== "undefined" && workspaceId) {
      const code = `#CONNECT-${workspaceId.substring(0, 8)}`
      navigator.clipboard.writeText(code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
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

      {/* 2. Main Content Grid */}
      <div className={`grid grid-cols-1 ${showManual ? "lg:grid-cols-2" : "max-w-3xl mx-auto"} gap-6`}>
        
        {/* Left side: Configuration Column */}
        <div className="space-y-6">
          
          {/* Card: Configuration Settings */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                  <Settings className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                    ตั้งค่าบัญชี LINE OA หอพัก
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    กำหนดค่าการเชื่อมต่อเพื่อรันระบบบิลและแจ้งเตือนอัตโนมัติ
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6 pt-2">
              
              {/* SECTION 1: Messaging API & LIFF Setup */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <h4 className="text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span>ส่วนที่ 1: บิลค่าเช่าลูกบ้าน (Messaging API & LIFF ID)</span>
                </h4>

                {/* Token Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
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
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      LINE LIFF ID
                    </label>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                      * จำเป็นสำหรับการผูกบัญชีลูกบ้าน
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
              </div>

              {/* SECTION 2: Admin Alerts Setup */}
              <div className="space-y-4 pt-1">
                <h4 className="text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>ส่วนที่ 2: ระบบแจ้งเตือนแอดมิน (Admin Notification Config)</span>
                </h4>

                {/* Enable/Disable Admin Notification System Toggle Switch Card */}
                <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl transition-colors shrink-0 ${
                      adminNotificationActive 
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" 
                        : "bg-slate-100 dark:bg-slate-950 text-slate-400"
                    }`}>
                      {adminNotificationActive ? (
                        <Bell className="w-5 h-5 animate-pulse" />
                      ) : (
                        <BellOff className="w-5 h-5" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <h5 className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-100">
                        สถานะระบบแจ้งเตือนแอดมิน
                      </h5>
                      <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                        {adminNotificationActive 
                          ? "🟢 เปิดใช้งาน: บоทจะแจ้งเตือนเมื่อผู้เช่าส่งหลักฐานการโอนเงิน" 
                          : "🔴 ปิดการแจ้งเตือน: แอดมินจะไม่ได้รับสลิปจนกว่าจะเปิดใช้งานอีกครั้ง"}
                      </p>
                    </div>
                  </div>

                  {/* Switch */}
                  <button
                    type="button"
                    onClick={handleToggleAdminNotification}
                    disabled={savingSettings}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                      adminNotificationActive 
                        ? "bg-emerald-500" 
                        : "bg-slate-200 dark:bg-slate-800"
                    } ${savingSettings ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-300 ease-in-out ${
                        adminNotificationActive ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className={`space-y-4 transition-all duration-300 ${!adminNotificationActive ? "opacity-65 pointer-events-none select-none" : ""}`}>

                {/* Webhook Endpoint Display (Only visible if configured) */}
                {workspaceId && (
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-2 shadow-inner">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Webhook URL สำหรับ LINE Developers:</span>
                      <button
                        type="button"
                        onClick={handleCopyWebhook}
                        className={`text-[11px] font-black flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                          copiedWebhook ? "bg-green-500/15 text-green-500 border border-green-500/20" : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/15 border border-blue-500/15"
                        }`}
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedWebhook ? "คัดลอกแล้ว!" : "คัดลอก"}</span>
                      </button>
                    </div>
                    <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-slate-800/80 break-all leading-normal select-all">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/webhook/line?workspace_id=${workspaceId}` : `https://saas-horset.vercel.app/api/webhook/line?workspace_id=${workspaceId}`}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                      💡 นำ URL นี้ไปบันทึกในช่อง Webhook URL ของ Messaging API ใน LINE Developers Console และเปิดใช้งาน "Use Webhook"
                    </p>
                  </div>
                )}

                {/* LINE Channel Secret Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    LINE Channel Secret
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showSecret ? "text" : "password"}
                      placeholder="0ca9550dc4ec7ce043831d47e18154bf"
                      className="w-full pl-3 pr-10 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      value={secretInput}
                      onChange={(e) => setSecretInput(e.target.value)}
                      disabled={isConfigured && !isEditing}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
                    >
                      {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                    * จำเป็นสำหรับตรวจสอบความปลอดภัย (Verify Signature) ของ LINE Webhook
                  </p>
                </div>

                {/* Admin User ID (for personal alerts) */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      รายชื่อแอดมินรับแจ้งเตือนสลิปส่วนตัว ({adminProfiles.length}/5 คน)
                    </label>
                    <span className="text-[10px] bg-blue-500/10 text-blue-500 font-extrabold px-2 py-0.5 rounded-full">
                      รองรับสูงสุด 5 คน
                    </span>
                  </div>

                  {/* Active Connection Code Banner */}
                  {connectionCode && codeCountdown > 0 && (
                    <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fadeIn mb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl font-mono font-extrabold text-sm shrink-0 animate-pulse">
                          {connectionCode}
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <h6 className="text-xs font-black text-indigo-600 dark:text-indigo-400">
                            รหัสเชื่อมต่อแอดมินอัตโนมัติเปิดใช้งานอยู่
                          </h6>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            ส่งรหัสนี้ไปหาบอทเพื่อผูกบัญชี (เหลือเวลา {Math.floor(codeCountdown / 60)}:{(codeCountdown % 60).toString().padStart(2, '0')})
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelConnectionCode}
                        className="shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
                      >
                        ยกเลิกรหัส
                      </button>
                    </div>
                  )}

                  {/* Admin Profiles Cards List */}
                  {adminProfiles.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2.5 animate-fadeIn">
                      {adminProfiles.map((p, idx) => {
                        const isNotificationEnabled = !disabledAdminUserIdsInput
                          .split(/[\s,\n]+/)
                          .map(id => id.trim())
                          .filter(id => id.length > 0)
                          .includes(p.userId);

                        return (
                          <div 
                            key={p.userId || idx}
                            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 shadow-sm transition-all duration-300 hover:shadow-md ${
                              p.success 
                                ? isNotificationEnabled
                                  ? "bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/10 dark:border-emerald-500/20" 
                                  : "bg-slate-500/5 dark:bg-slate-500/10 border-slate-200 dark:border-slate-800 opacity-80"
                                : "bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/10 dark:border-amber-500/20"
                            }`}
                          >
                            <div className="flex items-center gap-3.5 min-w-0">
                              {p.pictureUrl ? (
                                <img 
                                  src={p.pictureUrl} 
                                  alt={p.displayName} 
                                  className={`w-11 h-11 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shrink-0 ${
                                    isNotificationEnabled ? "" : "grayscale"
                                  }`}
                                  style={{ width: "44px", height: "44px" }}
                                />
                              ) : (
                                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-slate-500 font-extrabold text-sm shrink-0 ${
                                  isNotificationEnabled ? "bg-slate-200 dark:bg-slate-800" : "bg-slate-100 dark:bg-slate-900"
                                }`}>
                                  {p.displayName ? p.displayName.charAt(0).toUpperCase() : "?"}
                                </div>
                              )}
                              <div className="min-w-0 space-y-0.5">
                                <h5 className={`text-sm font-extrabold truncate flex items-center gap-2 ${
                                  isNotificationEnabled ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 line-through"
                                }`}>
                                  <span>{p.displayName}</span>
                                  {p.success ? (
                                    isNotificationEnabled ? (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black rounded">
                                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                        <span>พร้อมใช้งาน</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500 text-[9px] font-black rounded">
                                        <span className="w-1 h-1 rounded-full bg-slate-400" />
                                        <span>ปิดแจ้งเตือน</span>
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black rounded" title={p.error}>
                                      <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                      <span>ยังไม่เพิ่มเพื่อน</span>
                                    </span>
                                  )}
                                </h5>
                                <p className="text-[10px] font-mono font-semibold text-slate-400 dark:text-slate-500 truncate">
                                  ID: {p.userId}
                                </p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Toggle individual notification */}
                              <button
                                type="button"
                                onClick={() => handleToggleIndividualAdminNotification(p.userId)}
                                className={`p-2 rounded-xl border transition-all cursor-pointer shadow-sm flex items-center justify-center ${
                                  isNotificationEnabled
                                    ? "bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                                    : "bg-slate-500/5 hover:bg-slate-500/10 border-slate-200 dark:border-slate-850 text-slate-400"
                                }`}
                                title={isNotificationEnabled ? "ปิดการแจ้งเตือนสลิปส่วนตัวสำหรับแอดมินคนนี้" : "เปิดการแจ้งเตือนสลิปส่วนตัวสำหรับแอดมินคนนี้"}
                              >
                                {isNotificationEnabled ? (
                                  <Bell className="w-4 h-4" />
                                ) : (
                                  <BellOff className="w-4 h-4" />
                                )}
                              </button>

                              {/* Delete/Remove Button - only visible during Editing or if Not Configured */}
                              {(!isConfigured || isEditing) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAdmin(p.userId)}
                                  className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer shadow-sm group shrink-0"
                                  title="ลบผู้ใช้แอดมินท่านนี้"
                                >
                                  <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 font-semibold text-xs">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 shrink-0 animate-pulse" />
                      <span>ยังไม่มีการเชื่อมต่อแอดมิน LINE</span>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1">
                        คลิกปุ่มด้านล่างเพื่อเพิ่มการเชื่อมต่อแอดมินสำหรับส่งสลิปโอนเงินแจ้งเตือนโดยตรง
                      </p>
                    </div>
                  )}

                  {loadingProfiles && (
                    <div className="py-2.5 flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      <span>กำลังโหลดสถานะโปรไฟล์แอดมิน...</span>
                    </div>
                  )}

                  {/* Active Connection Codes History List */}
                  {activeCodesList.length > 0 && (
                    <div className="p-4 bg-slate-500/5 dark:bg-slate-800/5 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 mt-1.5 mb-2.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <h6 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          <span>รหัสเชื่อมต่อที่ใช้งานได้ ({activeCodesList.length})</span>
                        </h6>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                          รหัสจะลบออกอัตโนมัติเมื่อหมดอายุ
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {activeCodesList.map((item, idx) => {
                          const targetTime = +new Date(item.expires_at)
                          const now = +new Date()
                          const secondsLeft = Math.max(0, Math.floor((targetTime - now) / 1000))
                          
                          if (secondsLeft <= 0) return null; // Skip expired items

                          return (
                            <div 
                              key={item.code || idx} 
                              className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center justify-between gap-3 shadow-sm hover:border-indigo-500/20 dark:hover:border-indigo-500/30 transition-all"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1.5 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-lg font-mono font-black text-sm">
                                  {item.code}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-mono text-rose-500 dark:text-rose-400 font-bold">
                                    ⏱️ {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, "0")} นาที
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Copy Code Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.code)
                                    alert("📋 คัดลอกรหัสเชื่อมต่อสำเร็จแล้ว!")
                                  }}
                                  className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded-lg transition-all cursor-pointer shadow-sm"
                                  title="คัดลอกรหัส"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete/Cancel Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteConnectionCode(item.code)}
                                  className="p-1.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 text-rose-500 rounded-lg transition-all cursor-pointer shadow-sm"
                                  title="ยกเลิกรหัสนี้"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Connection Trigger Button */}
                  {(!isConfigured || isEditing) && adminProfiles.length < 5 ? (
                    <button
                      type="button"
                      onClick={handleOpenAddModal}
                      className="w-full py-4 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-500/5 dark:hover:border-blue-500/30 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-slate-500 hover:text-blue-600 cursor-pointer shadow-sm group"
                    >
                      <span className="p-2 bg-slate-100 dark:bg-slate-950 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-500/10 rounded-full transition-all">
                        <Plus className="w-5 h-5 shrink-0" />
                      </span>
                      <span className="text-xs font-black">เพิ่มการเชื่อมต่อ Line Admin</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">เพื่อตรวจจับชื่อโปรไฟล์แอดมินในระบบก่อนผูกการรับแจ้งเตือน</span>
                    </button>
                  ) : null}
                </div>

                {/* LINE Group Alert Connection Box */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    สถานะการเชื่อมต่อกลุ่ม LINE (แจ้งเตือนสลิปกลุ่มทีมงาน)
                  </label>
                  
                  {adminGroupIdInput ? (
                    <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fadeIn">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>เชื่อมต่อกลุ่ม LINE สำเร็จ</span>
                          </span>
                        </div>
                        <div className="text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400 break-all select-all pl-4">
                          Group ID: {adminGroupIdInput}
                        </div>
                      </div>
                      
                      {(!isConfigured || isEditing) && (
                        <button
                          type="button"
                          onClick={handleClearGroupId}
                          className="shrink-0 px-3.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
                        >
                          ยกเลิกเชื่อมกลุ่ม
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-inner leading-relaxed">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">ยังไม่ได้เชื่อมต่อกับกลุ่ม LINE ทีมงาน</span>
                      </div>
                      
                      {workspaceId ? (
                        <div className="space-y-3.5 pl-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                            👉 วิธีเชื่อมต่อ: ดึงบัญชี LINE OA หอพักตัวนี้เข้ากลุ่มแชทไลน์ทีมงาน/กลุ่มไลน์นิติบุคคลของคุณ จากนั้นพิมพ์คำสั่งเชื่อมต่อส่งลงในแชทกลุ่มดังนี้:
                          </p>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="flex-1 p-2.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 font-mono font-black text-xs md:text-sm text-center tracking-wider rounded-xl select-all">
                              #CONNECT-{workspaceId.substring(0, 8)}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyConnectionCode}
                              className={`shrink-0 px-4 py-2.5 border text-xs font-black rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                                copiedCode
                                  ? "bg-green-500/15 text-green-500 border-green-500/20 shadow-sm"
                                  : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-450 border-blue-500/15 shadow-sm"
                              }`}
                            >
                              {copiedCode ? <Check className="w-3.5 h-3.5 animate-bounce" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedCode ? "คัดลอกแล้ว!" : "คัดลอกคำสั่ง"}</span>
                            </button>
                          </div>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                            * เมื่อพิมพ์รหัสในกลุ่มสำเร็จ บอทจะลงทะเบียนเชื่อมต่อ Group ID เข้าสู่ระบบหอพักนี้ทันทีแบบอัตโนมัติ
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-rose-500 font-bold pl-4">กรุณาลงทะเบียนหรือเชื่อมต่อ LINE OA สำเร็จก่อนเพื่อรับรหัสเชื่อมต่อกลุ่ม</span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              </div> {/* Closes the opacity-65 visual wrapper */}

              {/* Status Alert */}
              {settingsError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-xs sm:text-sm font-bold flex items-start gap-2.5 shadow-inner">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 whitespace-pre-line leading-relaxed">{settingsError}</div>
                </div>
              )}

              {settingsSuccess && (
                <div className="p-3.5 bg-green-500/10 border border-green-500/20 text-green-500 rounded-xl text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{settingsSuccess}</span>
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-2.5 justify-end pt-3 flex-wrap">
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
                    key="edit-api-btn"
                    type="button"
                    onClick={() => {
                      setIsEditing(true)
                      setSettingsSuccess(null)
                      setSettingsError(null)
                    }}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-md shadow-blue-500/10"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>แก้ไขข้อมูล API & แจ้งเตือน</span>
                  </button>
                ) : (
                  <button
                    key="submit-api-btn"
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
                  >
                    {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{isConfigured ? "อัปเดตข้อมูลตั้งค่า" : "บันทึกข้อมูลตั้งค่า"}</span>
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

              {quotaError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl text-xs sm:text-sm font-bold flex items-start gap-2.5 shadow-inner">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1">
                    <span className="block font-extrabold text-rose-600 dark:text-rose-400">ดึงข้อมูลโควตาล่าสุดไม่สำเร็จ (LINE Integration Error):</span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed block">{quotaError}</span>
                  </div>
                </div>
              )}

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
            {/* Card 1: คู่มือเชื่อมต่อระบบ LINE OA ส่วนตัว */}
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
                
                 {/* Master expand/collapse button for Card 1 */}
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
                          เมื่อเริ่มสร้าง LINE Login ระบบจะตั้งสถานะเริ่มต้นเป็น <strong className="text-slate-700 dark:text-slate-300 font-bold">Developing (สีเทา)</strong> ทำให้เฉพาะตัวแอดมินเท่านั้นที่ใช้งานลิงก์ได้ แต่ผู้เช่าทั่วไปจะเจอปัญหากดสมัครไม่ได้หรือหน้าจอลูปหมุนวนไม่หยุด <strong className="text-emerald-650 dark:text-emerald-400 font-extrabold">วิธีแก้:</strong> คลิกที่แถบสถานะกลม ๆ สีเทามุมขวาบนของหน้า LINE Login ให้เปลี่ยนเป็นสถานะ <strong className="text-emerald-650 dark:text-emerald-400 font-extrabold">Published (สีเขียว)</strong> ก่อนใช้งานจริง
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

            {/* Card 2: คู่มือเชื่อมต่อระบบแจ้งเตือนฝั่งผู้ให้เช่า */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/10 text-indigo-500 rounded-xl">
                    <Settings className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                      คู่มือเชื่อมต่อระบบแจ้งเตือนฝั่งผู้ให้เช่า
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      ขั้นตอนเปิดใช้งานแจ้งเตือนสลิปโอนเงินเข้า LINE แอดมินและกลุ่มทีมงาน
                    </p>
                  </div>
                </div>
                
                 {/* Master expand/collapse button for Card 2 */}
                <button
                  type="button"
                  onClick={() => {
                    const allSubOpen = openSubStep1 && openSubStep2 && openSubStep3 && openSubStep4;
                    setOpenSubStep1(!allSubOpen);
                    setOpenSubStep2(!allSubOpen);
                    setOpenSubStep3(!allSubOpen);
                    setOpenSubStep4(!allSubOpen);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0"
                >
                  {openSubStep1 && openSubStep2 && openSubStep3 && openSubStep4 ? "ยุบทั้งหมด" : "ขยายทั้งหมด"}
                </button>
              </div>

              {/* Instruction Sub-steps List */}
              <div className="space-y-4 text-sm font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                
                {/* Sub-step 1: Webhook URL */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenSubStep1(!openSubStep1)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-500/20">
                        1
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ บันทึก Webhook URL</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep1 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep1 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                        คัดลอก <strong className="text-blue-600 dark:text-blue-450 font-extrabold">Webhook URL</strong> จากกล่องสีฟ้าใน ส่วนที่ 2 ทางด้านซ้ายของท่าน
                      </p>
                      
                      <div className="py-2.5">
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

                      <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                        เลือก <strong className="font-bold">Messaging API Channel</strong> ของท่าน เลื่อนแถบไปที่หัวข้อด้านบนชื่อ <strong className="font-bold">Messaging API</strong> เลือกลงมาตรงคำว่า <strong className="font-bold">Webhook URL</strong> นำข้อมูล Webhook URL ที่ก๊อปปี้ไปวางในช่องและกดคลิก <strong className="font-bold">Update</strong> บันทึกข้อมูล จากนั้นตรวจสอบว่าได้เปิดใช้สวิตช์ <strong className="text-blue-600 font-bold">"Use Webhook"</strong> เป็นที่เรียบร้อยแล้ว
                      </p>
                    </div>
                  )}
                </div>

                {/* Sub-step 2: Channel Secret */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenSubStep2(!openSubStep2)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-500/20">
                        2
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ ระบุ LINE Channel Secret</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep2 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep2 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-1.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                        ไปที่แท็บ <strong className="font-bold">Basic settings</strong> เลื่อนลงไปที่ช่อง <strong className="font-bold">Channel secret</strong> คัดลอกรหัสมาวางลงในช่อง <strong className="font-bold">LINE Channel Secret</strong> ด้านซ้าย (เพื่อนำมาใช้ถอดรหัสและ Verify ลายเซ็นดิจิตอลของ LINE Webhook ป้องกันผู้ไม่หวังดีส่ง Request ปลอม)
                      </p>
                    </div>
                  )}
                </div>

                {/* Sub-step 3: Admin User ID Pairing */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenSubStep3(!openSubStep3)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-500/20">
                        3
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ ผูกบัญชีแจ้งเตือน Admin ส่วนตัว</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep3 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep3 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-2.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                        แอดมินแต่ละท่านต้องทำการแอดเพื่อนบอตและทำตามวิธีใดวิธีหนึ่งดังนี้:
                      </p>
                      <div className="space-y-2 text-slate-500 dark:text-slate-400 font-medium pl-2 text-xs sm:text-sm leading-relaxed">
                        <div>
                          👉 <strong className="text-slate-850 dark:text-slate-200">วิธีที่ 1 (อัตโนมัติ - แนะนำ):</strong> คลิกปุ่ม <strong className="text-blue-600">"เพิ่มการเชื่อมต่อ Line Admin"</strong> ทางฝั่งซ้ายของท่าน แล้วกดยืนยันปุ่มสีฟ้าเพื่อสร้างรหัสตัวเลข 6 หลักชั่วคราวอายุ 5 นาที พิมพ์เฉพาะตัวเลขนี้ส่งหาบอตในห้องแชทไลน์ บอตจะผูกบัญชีให้ท่านโดยอัตโนมัติทันที!
                        </div>
                        <div className="pt-1">
                          👉 <strong className="text-slate-850 dark:text-slate-200">วิธีที่ 2 (แบบกรอกรหัสด้วยตัวเอง):</strong> ส่งคำสั่งคุยหาบอตว่า <code className="bg-slate-100 dark:bg-slate-850 px-1.5 py-0.5 rounded font-mono font-bold text-blue-600">#MYID</code> บอตจะส่ง LINE User ID ส่วนตัวของท่านกลับมา นำรหัสยาว 33 ตัวอักษรนั้นมากรอกลงในช่องค้นหาประวัติแบบแมนนวลเพื่อตรวจสอบโปรไฟล์และผูกบัญชีแอดมิน
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Sub-step 4: Admin LINE Group Pairing */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setOpenSubStep4(!openSubStep4)}
                    className="w-full flex items-center justify-between p-4 bg-slate-50/50 dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-950 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-500/10 text-indigo-650 dark:text-indigo-400 flex items-center justify-center text-xs font-black border border-indigo-500/20">
                        4
                      </span>
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">➡️ ผูกบัญชีแจ้งเตือนกลุ่มนิติบุคคล / กลุ่มทีมงาน</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep4 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep4 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-1.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400">
                        เชิญ LINE OA ของหอพักตัวนี้เข้าไปร่วมในกลุ่มแชทไลน์นิติบุคคล/กลุ่มทีมงาน จากนั้นให้สมาชิกในกลุ่มส่งข้อความคำสั่งรหัสเชื่อมต่อเข้าไปในกลุ่ม (เช่น <code className="bg-indigo-50 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono font-bold text-indigo-600 dark:text-indigo-400 select-all">#CONNECT-...</code>) บอทจะทำการลงทะเบียนรหัสกลุ่มเข้ากับระบบหอพักนี้ทันทีแบบอัตโนมัติพร้อมส่งข้อความตอบกลับเพื่อยืนยันเชื่อมต่อสำเร็จ!
                      </p>
                    </div>
                  )}
                </div>

              </div>
            </div>

          </div>
        )}

        {/* LINE Admin Connection Modal Overlay */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity cursor-pointer"
              onClick={handleCloseAddModal}
            />

            {/* Modal Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/85 rounded-3xl w-full max-w-md shadow-2xl p-6 relative z-10 animate-scaleIn space-y-5">
              {/* Header */}
              <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-base font-black text-slate-800 dark:text-slate-100">
                      เชื่อมต่อ LINE Admin
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider mt-0.5">
                      แอดมินแจ้งเตือนส่วนตัว
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="p-1.5 bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-xl transition-all cursor-pointer border border-slate-100 dark:border-slate-800/50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab("auto")
                    setModalError(null)
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    pairingTab === "auto"
                      ? "bg-white dark:bg-slate-850 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  }`}
                >
                  ⚡ ดึงข้อมูลอัตโนมัติ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab("manual")
                    setModalError(null)
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    pairingTab === "manual"
                      ? "bg-white dark:bg-slate-850 text-blue-600 dark:text-blue-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                  }`}
                >
                  📝 กรอกรหัสด้วยตัวเอง
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4">
                {pairingTab === "auto" ? (
                  <div className="space-y-4">
                    {!connectionCode ? (
                      <div className="space-y-4 text-center py-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                          ระบบจะสร้างรหัสผ่าน 6 หลักชั่วคราว ให้คุณส่งรหัสนี้ในแชท LINE บอทของหอพัก เพื่อผูกข้อมูล LINE ID และดึงโปรไฟล์ของคุณมาใช้งานโดยอัตโนมัติ
                        </p>
                        <button
                          type="button"
                          onClick={handleGenerateConnectionCode}
                          disabled={isGeneratingCode}
                          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isGeneratingCode ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Key className="w-4 h-4" />
                          )}
                          <span>{isGeneratingCode ? "กำลังสร้างรหัสเชื่อมต่อ..." : "สร้างรหัสเชื่อมต่ออัตโนมัติ"}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="bg-indigo-50/50 dark:bg-slate-950/80 border border-indigo-100/80 dark:border-indigo-900/30 rounded-2xl py-5 px-6 shadow-inner text-center space-y-2">
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block">
                            ส่งรหัสนี้หา LINE OA บอต
                          </span>
                          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono tracking-widest flex justify-center items-center select-all">
                            {connectionCode.split("").join(" ")}
                          </div>
                          <span className="text-xs text-rose-500 dark:text-rose-400 font-bold block">
                            ⏱️ รหัสหมดอายุในอีก {Math.floor(codeCountdown / 60)}:{(codeCountdown % 60).toString().padStart(2, "0")} นาที
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelConnectionCode}
                            className="mt-2 text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-black flex items-center justify-center gap-1 mx-auto transition-all bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 px-3 py-1 rounded-lg"
                          >
                            <X className="w-3.5 h-3.5 shrink-0" />
                            <span>ยกเลิกรหัสนี้</span>
                          </button>
                        </div>

                        <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-start gap-2.5 animate-pulse">
                          <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                          <div className="space-y-1">
                            <span className="text-xs font-black text-blue-600 dark:text-blue-450 block">กำลังรอรับรหัสในแชท LINE บอท...</span>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-normal">
                              เมื่อคุณพิมพ์เลข 6 หลักนี้ส่งในห้องแชท LINE OA ของหอพัก ระบบจะทำการเชื่อมโยงข้อมูลและปิดหน้าจอนี้โดยอัตโนมัติทันที!
                            </p>
                          </div>
                        </div>

                        <div className="text-xs space-y-2 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950">
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">📌 ขั้นตอนทำรายการ:</span>
                          <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 font-bold pl-1 text-[11px] sm:text-xs">
                            <li>แชทคุยกับ LINE OA ของหอพัก</li>
                            <li>พิมพ์เฉพาะตัวเลข <code className="bg-indigo-50 dark:bg-slate-900 px-1 py-0.5 rounded font-mono text-indigo-600 font-bold">{connectionCode}</code> ส่งหาบอต</li>
                            <li>ระบบจะทำรายการให้เสร็จสรรพโดยไม่ต้องกดปุ่มอะไรอีก!</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase block">
                        ระบุ LINE User ID ของแอดมิน (UID)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="U123456789abcdef0123456789abcdef0"
                          className="flex-1 px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60"
                          value={newUidInput}
                          onChange={(e) => setNewUidInput(e.target.value)}
                          disabled={modalLoading}
                        />
                        <button
                          type="button"
                          onClick={handleLookupProfile}
                          className="px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm flex items-center justify-center shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          disabled={modalLoading || !newUidInput.trim()}
                        >
                          {modalLoading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            "ตกลง"
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                        💡 พิมพ์ส่งคำสั่ง <code className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px]">#MYID</code> คุยหาบอทก่อน เพื่อรับรหัสความยาว 33 ตัวอักษร
                      </p>
                    </div>

                    {/* Dynamic LINE Profile Preview Card */}
                    {modalProfilePreview && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl animate-scaleIn space-y-3.5 shadow-inner">
                        <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                          ตรวจสอบข้อมูลโปรไฟล์สำเร็จ
                        </span>
                        
                        <div className="flex items-center gap-3.5">
                          {modalProfilePreview.pictureUrl ? (
                            <img 
                              src={modalProfilePreview.pictureUrl} 
                              alt={modalProfilePreview.displayName} 
                              className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-slate-800 shrink-0"
                              style={{ width: "48px", height: "48px" }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-black text-base shrink-0 border border-slate-300 dark:border-slate-700">
                              {modalProfilePreview.displayName ? modalProfilePreview.displayName.charAt(0).toUpperCase() : "?"}
                            </div>
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <h5 className="text-sm font-black text-slate-800 dark:text-slate-100 truncate">
                              {modalProfilePreview.displayName}
                            </h5>
                            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">
                              ID: {modalProfilePreview.userId}
                            </p>
                          </div>
                        </div>

                        {modalProfilePreview.success ? (
                          <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span className="text-[11px] font-bold">บัญชี LINE นี้เพิ่มเพื่อนบอทแล้ว พร้อมแจ้งเตือน!</span>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-amber-600 dark:text-amber-400 leading-normal">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="text-[10px] font-bold">
                              <span>ยังไม่ได้แอดเพื่อนบอท: </span>
                              <p className="font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                โปรไฟล์นี้จะไม่ได้รับข้อความแจ้งเตือนจนกว่าจะเพิ่มบอทเป็นเพื่อนใน LINE
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Error Box */}
                {modalError && (
                  <div className="p-3 bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-2xl flex items-start gap-2 animate-fadeIn">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="text-xs font-bold leading-relaxed">{modalError}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-4">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  className="flex-1 py-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-850 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-black transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                {pairingTab === "manual" && (
                  <button
                    type="button"
                    onClick={handleConfirmAddAdmin}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                    disabled={!modalProfilePreview}
                  >
                    <Check className="w-4 h-4" />
                    <span>ยืนยันการเพิ่ม</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
