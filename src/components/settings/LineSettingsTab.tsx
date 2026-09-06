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
  X,
  Lock
} from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import {
  getLineProfilesAction,
  generateAdminConnectionCodeAction,
  getLineSettingsAction,
  saveLineSettingsAction,
  toggleLineAdminNotificationAction,
  toggleIndividualLineAdminNotificationAction,
  deleteLineSettingsAction,
  clearLineAdminGroupIdAction,
  listActiveLineConnectionCodesAction,
  deleteLineConnectionCodeAction,
  pollLineConnectionCodeStatusAction,
  getLineQuotaAction,
  removeLineAdminAction
} from "@/features/notification/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"
import PricingModal from "@/features/subscription/components/PricingModal"
import RichMenuPanel from "@/components/settings/RichMenuPanel"

/** โปรไฟล์ LINE ของแอดมินหนึ่งคน (รูปแบบเดียวกับที่ getLineProfilesAction ส่งกลับมา) */
type LineAdminProfile = {
  userId: string
  displayName?: string
  pictureUrl?: string | null
  statusMessage?: string
  success?: boolean
  error?: string
}

export default function LineSettingsTab() {
  const { t, locale } = useLanguage()
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
  const [adminProfiles, setAdminProfiles] = useState<LineAdminProfile[]>([])
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
  const [showManual, setShowManual] = useState(false)
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

  // เช็คสิทธิ์ตามแผนปัจจุบัน (saas_plans.features.line_notify) — fail-open เมื่อยังไม่ผูกแผน
  // ให้ตรงกับ logic ฝั่ง server ใน assertWorkspaceFeatureEnabled/isWorkspaceFeatureEnabled
  const { subscription: featureSubscription } = useWorkspaceSubscription(isDemo ? "" : (workspaceId || ""))
  const featureEnabled = isDemo || !featureSubscription?.plan || !!featureSubscription.plan.features?.line_notify
  const [showPricingModal, setShowPricingModal] = useState(false)

  const [activeCodesList, setActiveCodesList] = useState<Array<{ code: string; expires_at: string }>>([])
  const [isLoadingActiveCodes, setIsLoadingActiveCodes] = useState(false)
  const [ticker, setTicker] = useState(0)

  const loadActiveCodesList = async (wsId: string) => {
    if (!wsId || isDemo) return
    setIsLoadingActiveCodes(true)
    try {
      const res = await listActiveLineConnectionCodesAction(wsId)
      if (!res.success || !res.data) {
        console.warn("Error loading active connection codes:", res.error)
        return
      }

      const data = res.data
      setActiveCodesList(data)

      // Set the main active connectionCode to the most recent one if available
      if (data.length > 0) {
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
            // ห้ามใช้ workspace ตัวอย่าง (demo seed) เป็นค่า fallback ตอนใช้งานจริงเด็ดขาด — จะไปโหลดข้อมูล LINE OA
            // จริงของ workspace อื่นมาแสดงผิดๆ ถ้าหา workspace_id ของผู้ใช้เองไม่เจอ ให้ถือว่ายังไม่พร้อมแทน
            wsId = res.data.workspace_id || ""
            setWorkspaceId(wsId)
            if (!wsId) {
              setSettingsError("ไม่สามารถระบุหอพัก (workspace) ของท่านได้ กรุณาเลือกหอพักจากเมนูด้านบนก่อน")
              setProfileLoading(false)
              return
            }
          } else {
            setSettingsError("ไม่สามารถระบุตัวตนของผู้ใช้ได้ กรุณาล็อกอินใหม่อีกครั้ง")
            setProfileLoading(false)
            return
          }

          // Fetch settings from workspace_line_settings table
          const settingsRes = await getLineSettingsAction(wsId)

          if (!settingsRes.success) {
            console.warn("Could not query workspace_line_settings, it may need creation:", settingsRes.error)
          } else if (settingsRes.data) {
            const data = settingsRes.data
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
        const res = await pollLineConnectionCodeStatusAction(workspaceId, connectionCode)

        if (res.success && res.used && isSubscribed) {
          clearInterval(interval)

          setAdminUserIdInput(res.adminLineUserId || "")
          setSavedAdminUserId(res.adminLineUserId || "")
          setDisabledAdminUserIdsInput(res.disabledAdminLineUserIds || "")
          setSavedDisabledAdminUserIds(res.disabledAdminLineUserIds || "")
          await loadAdminProfiles(res.adminLineUserId || "", workspaceId)
          await loadActiveCodesList(workspaceId)

          setSettingsSuccess(t("line_settings.success_auto_pairing"))
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
        setModalError(res.error || t("line_settings.err_generate_code"))
      }
    } catch (err: any) {
      console.error("Error generating pairing code:", err)
      setModalError(err.message || t("line_settings.err_tech"))
    } finally {
      setIsGeneratingCode(false)
    }
  }

  const handleLookupProfile = async () => {
    const trimmedUid = newUidInput.trim()
    if (!trimmedUid) {
      setModalError(t("line_settings.err_empty_uid"))
      return
    }
    if (!trimmedUid.startsWith("U") || trimmedUid.length !== 33) {
      setModalError(t("line_settings.err_invalid_uid_format"))
      return
    }
    if (adminProfiles.some((p: any) => p.userId === trimmedUid)) {
      setModalError(t("line_settings.err_uid_already_added"))
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
          displayName: locale === "th" ? "แอดมินจำลอง (จากการสืบค้นเดโม)" : "Mock Admin (from Demo lookup)",
          pictureUrl: null,
          success: true
        })
        return
      }

      const res = await getLineProfilesAction(trimmedUid, workspaceId || "")
      if (res.success && res.data && res.data.length > 0) {
        const profile = res.data[0]
        setModalProfilePreview(profile)
      } else {
        setModalError(res.error || t("line_settings.err_lookup_profile"))
      }
    } catch (err: any) {
      console.error("Error looking up profile:", err)
      setModalError(err.message || t("line_settings.err_exception_lookup"))
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

  /**
   * ลบการเชื่อมต่อ LINE Admin ออกหนึ่งคน — บันทึกลงฐานข้อมูลทันที
   *
   * เดิมฟังก์ชันนี้แก้แค่ state ในหน้าจอ ต้องกด "อัปเดตการตั้งค่า" อีกทีถึงจะมีผลจริง
   * ปิดหน้าไปก่อนคือไม่มีอะไรเกิดขึ้น จึงเปลี่ยนมาเรียก server action ตรง ๆ
   */
  const handleDeleteAdmin = async (uidToDelete: string) => {
    if (!uidToDelete) return

    const target = adminProfiles.find((p: LineAdminProfile) => p.userId === uidToDelete)
    const displayName = target?.displayName || uidToDelete
    const isLastAdmin = adminProfiles.length <= 1

    const confirmText = isLastAdmin
      ? t("line_settings.confirm_delete_last_admin").replace("{name}", displayName)
      : t("line_settings.confirm_delete_admin").replace("{name}", displayName)
    if (!confirm(confirmText)) return

    setSettingsError(null)
    setSettingsSuccess(null)

    // โหมดสาธิตไม่มี workspace จริงให้บันทึก — ตัดออกจากรายการในจอไปเลย
    if (isDemo || !workspaceId) {
      applyAdminRemovalToState(uidToDelete)
      setSettingsSuccess(t("line_settings.success_delete_admin").replace("{name}", displayName))
      return
    }

    setModalLoading(true)
    try {
      const res = await removeLineAdminAction(workspaceId, uidToDelete)
      if (!res.success) throw new Error(res.error)

      applyAdminRemovalToState(uidToDelete)
      setSavedAdminUserId(res.data?.adminLineUserId || "")
      setSettingsSuccess(t("line_settings.success_delete_admin").replace("{name}", displayName))
    } catch (err: unknown) {
      console.error("Error removing LINE admin:", err)
      setSettingsError(err instanceof Error ? err.message : t("line_settings.err_tech"))
    } finally {
      setModalLoading(false)
    }
  }

  /** ตัดคนที่ถูกลบออกจาก state ทุกที่ที่อ้างถึง UID นั้น */
  const applyAdminRemovalToState = (uidToDelete: string) => {
    const updatedProfiles = adminProfiles.filter((p: LineAdminProfile) => p.userId !== uidToDelete)
    setAdminProfiles(updatedProfiles)
    setAdminUserIdInput(updatedProfiles.map((p: LineAdminProfile) => p.userId).join(", "))

    const updatedDisabledStr = (disabledAdminUserIdsInput || "")
      .split(/[\s,\n]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0 && id !== uidToDelete)
      .join(",")
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
    if (!confirm(t("line_settings.confirm_delete_code").replace("{code}", codeToDelete))) return

    setModalLoading(true)
    try {
      if (isDemo) {
        await new Promise((resolve) => setTimeout(resolve, 300))
        setActiveCodesList(prev => prev.filter(c => c.code !== codeToDelete))
        if (connectionCode === codeToDelete) {
          setConnectionCode(null)
          setCodeExpiresAt(null)
        }
        setSettingsSuccess(t("line_settings.success_cancel_code_demo"))
        return
      }

      const res = await deleteLineConnectionCodeAction(workspaceId, codeToDelete)
      if (!res.success) throw new Error(res.error)

      setSettingsSuccess(t("line_settings.success_cancel_code").replace("{code}", codeToDelete))
      
      // Refresh active codes list
      await loadActiveCodesList(workspaceId)
    } catch (err: any) {
      console.error("Error canceling connection code:", err)
      setSettingsError(err.message || t("line_settings.err_tech"))
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
        setSettingsSuccess(t("line_settings.success_toggle_individual_demo"))
        return
      }

      const res = await toggleIndividualLineAdminNotificationAction(workspaceId, newDisabledStr)
      if (!res.success) throw new Error(res.error)

      setSettingsSuccess(t("line_settings.success_toggle_individual"))
    } catch (err: any) {
      console.error("Error toggling individual admin notification:", err)
      setDisabledAdminUserIdsInput(savedDisabledAdminUserIds)
      setSettingsError(err.message || t("line_settings.err_tech"))
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
      const res = await getLineQuotaAction(activeWsId, forceRefresh)

      if (res.success && res.data) {
        const data = res.data
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
        throw new Error(res.error || t("line_settings.err_quota_api"))
      }
    } catch (err: any) {
      console.error("Error fetching LINE quota:", err)
      setQuotaError(err.message || t("line_settings.err_quota_edge"))
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
      setSettingsSuccess(t("line_settings.success_toggle_admin_demo").replace("{state}", nextState ? (locale === "th" ? "เปิด" : "Enabled") : (locale === "th" ? "ปิด" : "Disabled")))
      setSavingSettings(false)
      return
    }

    try {
      const res = await toggleLineAdminNotificationAction(workspaceId, nextState)
      if (!res.success) throw new Error(res.error)

      setSavedAdminNotificationActive(nextState)
      setSettingsSuccess(t("line_settings.success_toggle_admin").replace("{state}", nextState ? (locale === "th" ? "เปิด" : "Enabled") : (locale === "th" ? "ปิด" : "Disabled")))
    } catch (err: any) {
      console.error("Error toggling admin notification:", err)
      setAdminNotificationActive(adminNotificationActive) // Revert state
      
      if (err.message && (
        err.message.includes("column") ||
        err.message.includes("admin_notification_active")
      )) {
        setSettingsError(
          t("line_settings.err_db_patch_warning_toggle")
        )
      } else {
        setSettingsError(err.message || t("line_settings.err_tech"))
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
      const res = await saveLineSettingsAction(workspaceId, {
        channelAccessToken: trimmedToken,
        liffId: trimmedLiff,
        channelSecret: trimmedSecret,
        adminLineUserId: trimmedAdminUserId,
        adminLineGroupId: trimmedAdminGroupId,
        adminNotificationActive,
        disabledAdminLineUserIds: disabledAdminUserIdsInput
      })

      if (!res.success) throw new Error(res.error)

      setIsConfigured(!!trimmedToken)
      setSavedToken(trimmedToken)
      setSavedLiff(trimmedLiff)
      setSavedSecret(trimmedSecret)
      setSavedAdminUserId(trimmedAdminUserId)
      setSavedAdminGroupId(trimmedAdminGroupId)
      setSavedAdminNotificationActive(adminNotificationActive)
      setIsEditing(false)
      setSettingsSuccess(t("line_settings.success_save"))
      
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
          t("line_settings.err_db_patch_warning")
        )
      } else {
        setSettingsError(err.message || t("line_settings.err_tech"))
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
    if (!confirm(t("line_settings.confirm_delete_settings"))) return

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
      setSettingsSuccess(t("line_settings.success_delete_demo"))
      setSavingSettings(false)
      return
    }

    try {
      const res = await deleteLineSettingsAction(workspaceId)
      if (!res.success) throw new Error(res.error)

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
      setSettingsSuccess(t("line_settings.success_delete"))
    } catch (err: any) {
      console.error("Error deleting LINE settings:", err)
      setSettingsError(err.message || t("line_settings.err_tech"))
    } finally {
      setSavingSettings(false)
    }
  }

  const handleClearGroupId = async () => {
    if (!workspaceId) return
    if (!confirm(t("line_settings.confirm_clear_group"))) return

    setSavingSettings(true)
    setSettingsError(null)
    setSettingsSuccess(null)

    if (isDemo) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      setAdminGroupIdInput("")
      setSavedAdminGroupId("")
      setSettingsSuccess(t("line_settings.success_clear_group_demo"))
      setSavingSettings(false)
      return
    }

    try {
      const res = await clearLineAdminGroupIdAction(workspaceId)
      if (!res.success) throw new Error(res.error)

      setAdminGroupIdInput("")
      setSavedAdminGroupId("")
      setSettingsSuccess(t("line_settings.success_clear_group"))
    } catch (err: any) {
      console.error("Error clearing group ID:", err)
      setSettingsError(err.message || t("line_settings.err_tech"))
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
        <span>{t("line_settings.loading_settings")}</span>
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
            <span>{t("line_settings.title")}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-sans font-semibold">
            {t("line_settings.subtitle")}
          </p>
        </div>
        <button
          onClick={() => setShowManual(!showManual)}
          className="shrink-0 px-4 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-2xl text-xs sm:text-sm font-black flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          {showManual ? (
            <>
              <EyeOff className="w-4 h-4" />
              <span>{t("line_settings.hide_manual")}</span>
            </>
          ) : (
            <>
              <Eye className="w-4 h-4" />
              <span>{t("line_settings.show_manual")}</span>
            </>
          )}
        </button>
      </div>

      {!featureEnabled && (
        <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border-2 border-rose-400 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/30 shadow-md shadow-rose-500/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-600/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <p className="text-xs sm:text-sm font-black text-rose-900 dark:text-rose-200 leading-relaxed">
              แผนการใช้งานปัจจุบันไม่รองรับฟีเจอร์แจ้งเตือนผ่าน LINE (line_notify)
              <span className="block sm:inline font-bold text-rose-700 dark:text-rose-300 sm:ml-1">
                กรุณาอัปเกรดแผนเพื่อเชื่อมต่อและใช้งานได้ตามปกติ
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPricingModal(true)}
            className="shrink-0 h-9 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer whitespace-nowrap"
          >
            อัปเกรดแผน
          </button>
        </div>
      )}

      {/* 2. Main Content Grid */}
      <div className={`grid grid-cols-1 ${showManual ? "lg:grid-cols-2" : "max-w-3xl mx-auto"} gap-6`}>

        {/* Left side: Configuration Column */}
        <div className="space-y-6">

          {/* Card: Quota Information (ย้ายมาไว้บนสุดให้เห็นก่อนตั้งค่าบัญชี + อัปเดตข้อมูลอัตโนมัติ ไม่ต้องกดเช็คเอง) */}
          {isConfigured && (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
              <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                      <span>{t("line_settings.check_quota")}</span>
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
                      {t("line_settings.quota_desc")}
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
                    <span className="block font-extrabold text-rose-600 dark:text-rose-400">{t("line_settings.quota_error_title")}</span>
                    <span className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed block">{quotaError}</span>
                  </div>
                </div>
              )}

              {quotaData ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">{t("line_settings.quota_consumed")}</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.consumed.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">{t("line_settings.quota_unit")}</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">{t("line_settings.quota_remaining")}</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.remaining.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">{t("line_settings.quota_unit")}</span>
                    </div>
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/60 rounded-2xl flex flex-col justify-between">
                      <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">{t("line_settings.quota_total")}</span>
                      <strong className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">{quotaData.limit.toLocaleString()}</strong>
                      <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">{t("line_settings.quota_unit")}</span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs sm:text-sm font-extrabold text-slate-500 dark:text-slate-400">
                      <span>{t("line_settings.quota_percent")}</span>
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
                        <span className="bg-slate-100 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-800 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t("line_settings.quota_cache")}</span>
                      ) : (
                        <span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded border border-green-500/20 text-[10px] font-bold uppercase tracking-wider">{t("line_settings.quota_live")}</span>
                      )}
                      <span>
                        {t("line_settings.quota_source")}{" "}
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
                      {t("line_settings.quota_updated")}{" "}
                      {(() => {
                        try {
                          const date = new Date(quotaData.updated_at);
                          return isNaN(date.getTime())
                            ? "--:--:--"
                            : date.toLocaleTimeString(locale === "th" ? "th-TH" : "en-US", { hour12: false });
                        } catch (e) {
                          return "--:--:--";
                        }
                      })()}{" "}
                      {t("line_settings.quota_unit_suffix")}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-slate-400 text-sm font-bold">
                  <span>{t("line_settings.quota_none")}</span>
                </div>
              )}
            </div>
          )}

          {/* Card: Rich Menu (แสดงเฉพาะเมื่อเชื่อมต่อ LINE OA แล้ว เพราะต้องมี channel access token ถึงจะติดตั้งเมนูได้) */}
          {isConfigured && workspaceId && (
            <RichMenuPanel workspaceId={workspaceId} channelConfigured={isConfigured} />
          )}

          {/* Card: Configuration Settings */}
          <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
                  <Settings className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800 dark:text-slate-100">
                    {t("line_settings.account_config_title")}
                  </h3>
                  <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    {t("line_settings.account_config_desc")}
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-6 pt-2">
              
              {/* SECTION 1: Messaging API & LIFF Setup */}
              <div className="space-y-4 border-b border-slate-100 dark:border-slate-800 pb-5">
                <h4 className="text-xs sm:text-sm font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span>{t("line_settings.sec1_title")}</span>
                </h4>

                {/* Token Input */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    {t("line_settings.token_label")}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type={showToken ? "text" : "password"}
                      placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      className="w-full pl-3 pr-10 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      required
                      disabled={(isConfigured && !isEditing) || !featureEnabled}
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
                      {t("line_settings.liff_label")}
                    </label>
                    <span className="text-xs text-slate-400 dark:text-slate-500 font-bold">
                      * {t("line_settings.liff_hint")}
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="2010442620-H4josaDy"
                    className="w-full px-3 py-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-blue-500 text-slate-700 dark:text-slate-200 text-sm font-mono transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    value={liffInput}
                    onChange={(e) => setLiffInput(e.target.value)}
                    required
                    disabled={(isConfigured && !isEditing) || !featureEnabled}
                  />
                </div>
              </div>

              {/* SECTION 2: Admin Alerts Setup */}
              <div className="space-y-4 pt-1">
                <h4 className="text-xs sm:text-sm font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  <span>{t("line_settings.sec2_title")}</span>
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
                        {t("line_settings.admin_notify_status")}
                      </h5>
                      <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 font-bold leading-normal">
                        {adminNotificationActive 
                          ? `🟢 ${t("line_settings.admin_notify_on")}` 
                          : `🔴 ${t("line_settings.admin_notify_off")}`}
                      </p>
                    </div>
                  </div>

                  {/* Switch */}
                  <button
                    type="button"
                    onClick={handleToggleAdminNotification}
                    disabled={savingSettings || !featureEnabled}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none ${
                      adminNotificationActive
                        ? "bg-emerald-500"
                        : "bg-slate-200 dark:bg-slate-800"
                    } ${savingSettings || !featureEnabled ? "opacity-60 cursor-not-allowed" : ""}`}
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
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{t("line_settings.webhook_label")}</span>
                      <button
                        type="button"
                        onClick={handleCopyWebhook}
                        className={`text-[11px] font-black flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all ${
                          copiedWebhook ? "bg-green-500/15 text-green-500 border border-green-500/20" : "bg-blue-500/10 text-blue-500 hover:bg-blue-500/15 border border-blue-500/15"
                        }`}
                      >
                        {copiedWebhook ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedWebhook ? t("line_settings.copied") : t("line_settings.copy")}</span>
                      </button>
                    </div>
                    <div className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 px-3 py-2 rounded-xl border border-slate-200/50 dark:border-slate-800/80 break-all leading-normal select-all">
                      {typeof window !== "undefined" ? `${window.location.origin}/api/webhook/line?workspace_id=${workspaceId}` : `https://saas-horset.vercel.app/api/webhook/line?workspace_id=${workspaceId}`}
                    </div>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                      💡 {t("line_settings.webhook_hint")}
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
                      disabled={(isConfigured && !isEditing) || !featureEnabled}
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
                    * {t("line_settings.secret_hint")}
                  </p>
                </div>

                {/* Admin User ID (for personal alerts) */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                      {t("line_settings.admin_personal_list").replace("{count}", adminProfiles.length.toString())}
                    </label>
                    <span className="text-[10px] bg-blue-500/10 text-blue-500 font-extrabold px-2 py-0.5 rounded-full">
                      {t("line_settings.admin_personal_max")}
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
                            {t("line_settings.admin_pairing_active")}
                          </h6>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold truncate">
                            {t("line_settings.admin_pairing_desc").replace("{time}", `${Math.floor(codeCountdown / 60)}:${(codeCountdown % 60).toString().padStart(2, '0')}`)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCancelConnectionCode}
                        className="shrink-0 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 hover:border-rose-500/30 text-rose-500 rounded-xl text-xs font-black transition-all cursor-pointer shadow-sm"
                      >
                        {t("line_settings.cancel_code_btn")}
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
                                        <span>{t("line_settings.admin_ready")}</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-400 dark:bg-slate-900 dark:text-slate-500 text-[9px] font-black rounded">
                                        <span className="w-1 h-1 rounded-full bg-slate-400" />
                                        <span>{t("line_settings.admin_muted")}</span>
                                      </span>
                                    )
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[9px] font-black rounded" title={p.error}>
                                      <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse" />
                                      <span>{t("line_settings.admin_not_friend")}</span>
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
                                title={isNotificationEnabled ? t("line_settings.mute_admin_tip") : t("line_settings.unmute_admin_tip")}
                              >
                                {isNotificationEnabled ? (
                                  <Bell className="w-4 h-4" />
                                ) : (
                                  <BellOff className="w-4 h-4" />
                                )}
                              </button>

                              {/* ปุ่มลบ — แสดงตลอด ไม่ซ่อนหลังโหมดแก้ไข เพราะเป็น action ของตัวเองที่บันทึกทันที */}
                              <button
                                type="button"
                                onClick={() => handleDeleteAdmin(p.userId)}
                                disabled={modalLoading}
                                className="p-2 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-rose-500 border border-rose-500/20 hover:border-rose-500/30 rounded-xl transition-all cursor-pointer shadow-sm group shrink-0"
                                title={t("line_settings.delete_admin_tip")}
                              >
                                <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="py-6 px-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 font-semibold text-xs">
                      <Users className="w-8 h-8 text-slate-300 dark:text-slate-700 mb-2 shrink-0 animate-pulse" />
                      <span>{t("line_settings.admin_none")}</span>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1">
                        {t("line_settings.admin_none_desc")}
                      </p>
                    </div>
                  )}

                  {loadingProfiles && (
                    <div className="py-2.5 flex items-center justify-center gap-2 text-slate-400 text-xs font-semibold animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
                      <span>{t("line_settings.admin_loading_profiles")}</span>
                    </div>
                  )}

                  {/* Active Connection Codes History List */}
                  {activeCodesList.length > 0 && (
                    <div className="p-4 bg-slate-500/5 dark:bg-slate-800/5 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 mt-1.5 mb-2.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <h6 className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          <span>{t("line_settings.active_codes_title").replace("{count}", activeCodesList.length.toString())}</span>
                        </h6>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">
                          {t("line_settings.active_codes_expiry_hint")}
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
                                    ⏱️ {t("line_settings.seconds_left").replace("{time}", `${Math.floor(secondsLeft / 60)}:${(secondsLeft % 60).toString().padStart(2, "0")}`)}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {/* Copy Code Button */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(item.code)
                                    alert(t("line_settings.copied_code_alert"))
                                  }}
                                  className="p-1.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 rounded-lg transition-all cursor-pointer shadow-sm"
                                  title={t("line_settings.copy_code_tip")}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>

                                {/* Delete/Cancel Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteConnectionCode(item.code)}
                                  className="p-1.5 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 text-rose-500 rounded-lg transition-all cursor-pointer shadow-sm"
                                  title={t("line_settings.cancel_code_tip")}
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
                      disabled={!featureEnabled}
                      className="w-full py-4 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-blue-500 hover:bg-blue-500/5 dark:hover:border-blue-500/30 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition-all text-slate-500 hover:text-blue-600 cursor-pointer shadow-sm group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="p-2 bg-slate-100 dark:bg-slate-950 text-slate-400 group-hover:text-blue-500 group-hover:bg-blue-500/10 rounded-full transition-all">
                        <Plus className="w-5 h-5 shrink-0" />
                      </span>
                      <span className="text-xs font-black">{t("line_settings.add_admin_btn")}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{t("line_settings.add_admin_desc")}</span>
                    </button>
                  ) : null}
                </div>

                {/* LINE Group Alert Connection Box */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                    {t("line_settings.line_group_status_label")}
                  </label>
                  
                  {adminGroupIdInput ? (
                    <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm animate-fadeIn">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span>{t("line_settings.line_group_success")}</span>
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
                          {t("line_settings.clear_group_btn")}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3 shadow-inner leading-relaxed">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{t("line_settings.line_group_not_connected")}</span>
                      </div>
                      
                      {workspaceId ? (
                        <div className="space-y-3.5 pl-4">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                            👉 {t("line_settings.line_group_connect_how")}
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
                              <span>{copiedCode ? t("line_settings.copied") : t("line_settings.copy_command_btn")}</span>
                            </button>
                          </div>
                          <span className="block text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                            * {t("line_settings.line_group_connect_hint")}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-rose-500 font-bold pl-4">{t("line_settings.line_group_err_not_configured")}</span>
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
                    {t("line_settings.delete_connection_btn")}
                  </button>
                )}

                {isConfigured && isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingSettings}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-bold cursor-pointer transition-colors"
                  >
                    {t("line_settings.cancel_edit_btn")}
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
                    <span>{t("line_settings.edit_api_btn")}</span>
                  </button>
                ) : (
                  <button
                    key="submit-api-btn"
                    type="submit"
                    disabled={savingSettings || !featureEnabled}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-blue-500/10"
                  >
                    {savingSettings ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>{isConfigured ? t("line_settings.update_config_btn") : t("line_settings.save_config_btn")}</span>
                  </button>
                )}
              </div>
            </form>
          </div>

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
                      {t("line_settings.guide_title_1")}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      {t("line_settings.guide_subtitle_1")}
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
                  {openStep1 && openStep2 && openStep3 && openWarnings ? t("line_settings.guide_collapse_all") : t("line_settings.guide_expand_all")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_step_1_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep1 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep1 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_1_desc_1")}
                      </p>
                      <div className="py-1">
                        <a 
                          href="https://developers.line.biz" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-blue-500/10"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{t("line_settings.guide_step_1_btn_1")}</span>
                        </a>
                      </div>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_1_desc_2")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_step_2_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep2 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep2 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_2_desc_1")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_2_desc_2")}
                      </p>
                      
                      <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-3.5 my-2.5 shadow-inner">
                        <p className="font-extrabold text-emerald-650 dark:text-emerald-400 text-xs sm:text-sm leading-normal">
                          💡 {t("line_settings.guide_step_2_tip_title")}
                        </p>
                        <div className="py-1">
                          <a 
                            href="https://manager.line.biz" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>{t("line_settings.guide_step_2_btn_2")}</span>
                          </a>
                        </div>
                        <div className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 space-y-2.5 font-medium pl-1">
                          <div>{t("line_settings.guide_step_2_tip_item_1")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_2")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_3")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_4")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_5")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_6")}</div>
                          <div>{t("line_settings.guide_step_2_tip_item_7")}</div>
                        </div>
                      </div>

                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_2_desc_3")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_2_desc_4")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_2_desc_5")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_step_3_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openStep3 ? "rotate-180" : ""}`} />
                  </button>
                  
                  {openStep3 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3.5 animate-fadeIn">
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_1")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_2")}
                      </p>
                      
                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2.5 font-mono shadow-inner leading-relaxed text-slate-700 dark:text-slate-300">
                        <div>{t("line_settings.guide_step_3_config_1")}</div>
                        <div>{t("line_settings.guide_step_3_config_2")}</div>
                        <div>{t("line_settings.guide_step_3_config_3")}</div>
                        <div>{t("line_settings.guide_step_3_config_4")}</div>
                        <div>{t("line_settings.guide_step_3_config_5")}</div>
                      </div>

                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_3")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_4")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_5")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_6")}
                      </p>

                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs space-y-2.5 font-mono shadow-inner leading-relaxed text-slate-700 dark:text-slate-300">
                        <div>{t("line_settings.guide_step_3_config_6")}</div>
                        <div>{t("line_settings.guide_step_3_config_7")}</div>
                        <div className="space-y-2 border-y border-slate-200/50 dark:border-slate-800/60 py-2.5 my-1">
                          <div className="flex items-center gap-1.5 font-semibold">{t("line_settings.guide_step_3_config_8")}</div>
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
                              <span>{copiedEndpoint ? t("line_settings.copied") : t("line_settings.copy_link_btn")}</span>
                            </button>
                          </div>
                        </div>
                        <div>{t("line_settings.guide_step_3_config_9")}</div>
                        <div>{t("line_settings.guide_step_3_config_10")}</div>
                      </div>

                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_7")}
                      </p>
                      <p className="leading-relaxed">
                        {t("line_settings.guide_step_3_desc_8")}
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
                      <span className="font-extrabold text-rose-700 dark:text-rose-400 text-sm md:text-base">{t("line_settings.guide_warnings_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-rose-400 transition-transform duration-300 ${openWarnings ? "rotate-180" : ""}`} />
                  </button>

                  {openWarnings && (
                    <div className="p-5 bg-transparent border-t border-rose-200/30 dark:border-rose-900/20 space-y-4 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium animate-fadeIn">
                      
                      {/* Warning 1 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {t("line_settings.guide_warning_1_title")}
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {t("line_settings.guide_warning_1_desc")}
                        </p>
                      </div>

                      {/* Warning 2 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {t("line_settings.guide_warning_2_title")}
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {t("line_settings.guide_warning_2_desc")}
                        </p>
                      </div>

                      {/* Warning 3 */}
                      <div className="space-y-1">
                        <strong className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          {t("line_settings.guide_warning_3_title")}
                        </strong>
                        <p className="pl-4 leading-relaxed text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                          {t("line_settings.guide_warning_3_desc")}
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
                      {t("line_settings.guide_title_2")}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-500 font-bold mt-1">
                      {t("line_settings.guide_subtitle_2")}
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
                  {openSubStep1 && openSubStep2 && openSubStep3 && openSubStep4 ? t("line_settings.guide_collapse_all") : t("line_settings.guide_expand_all")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_substep_1_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep1 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep1 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-3 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {t("line_settings.guide_substep_1_desc_1")}
                      </p>
                      
                      <div className="py-2.5">
                        <a 
                          href="https://developers.line.biz" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-blue-500/10"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{t("line_settings.guide_step_1_btn_1")}</span>
                        </a>
                      </div>

                      <p className="leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {t("line_settings.guide_substep_1_desc_2")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_substep_2_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep2 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep2 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-1.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {t("line_settings.guide_substep_2_desc_1")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_substep_3_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep3 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep3 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-2.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {t("line_settings.guide_substep_3_desc_1")}
                      </p>
                      <div className="space-y-2 text-slate-500 dark:text-slate-400 font-medium pl-2 text-xs sm:text-sm leading-relaxed">
                        <div>
                          👉 {t("line_settings.guide_substep_3_method_1")}
                        </div>
                        <div className="pt-1">
                          👉 {t("line_settings.guide_substep_3_method_2")}
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
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 text-sm md:text-base">{t("line_settings.guide_substep_4_title")}</span>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-300 ${openSubStep4 ? "rotate-180" : ""}`} />
                  </button>

                  {openSubStep4 && (
                    <div className="p-4 bg-transparent border-t border-slate-100 dark:border-slate-800/60 text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-medium space-y-1.5 animate-fadeIn">
                      <p className="leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                        {t("line_settings.guide_substep_4_desc_1")}
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
                      {t("line_settings.connect_admin_modal_title")}
                    </h4>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider mt-0.5">
                      {t("line_settings.connect_admin_modal_subtitle")}
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
                  {t("line_settings.tab_auto")}
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
                  {t("line_settings.tab_manual")}
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4">
                {pairingTab === "auto" ? (
                  <div className="space-y-4">
                    {!connectionCode ? (
                      <div className="space-y-4 text-center py-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                          {t("line_settings.auto_desc")}
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
                          <span>{isGeneratingCode ? t("line_settings.btn_generating_code") : t("line_settings.btn_generate_code")}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 animate-fadeIn">
                        <div className="bg-indigo-50/50 dark:bg-slate-950/80 border border-indigo-100/80 dark:border-indigo-900/30 rounded-2xl py-5 px-6 shadow-inner text-center space-y-2">
                          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-wider block">
                            {t("line_settings.send_code_to_bot")}
                          </span>
                          <div className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 font-mono tracking-widest flex justify-center items-center select-all">
                            {connectionCode.split("").join(" ")}
                          </div>
                          <span className="text-xs text-rose-500 dark:text-rose-400 font-bold block">
                            {t("line_settings.code_expires_in").replace("{time}", `${Math.floor(codeCountdown / 60)}:${(codeCountdown % 60).toString().padStart(2, "0")}`)}
                          </span>
                          <button
                            type="button"
                            onClick={handleCancelConnectionCode}
                            className="mt-2 text-[11px] text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 font-black flex items-center justify-center gap-1 mx-auto transition-all bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 hover:border-rose-500/20 px-3 py-1 rounded-lg"
                          >
                            <X className="w-3.5 h-3.5 shrink-0" />
                            <span>{t("line_settings.cancel_code_btn")}</span>
                          </button>
                        </div>

                        <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-start gap-2.5 animate-pulse">
                          <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 mt-0.5 animate-spin" />
                          <div className="space-y-1">
                            <span className="text-xs font-black text-blue-600 dark:text-blue-450 block">{t("line_settings.waiting_for_code")}</span>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold leading-normal">
                              {t("line_settings.waiting_for_code_desc")}
                            </p>
                          </div>
                        </div>

                        <div className="text-xs space-y-2 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950">
                          <span className="font-extrabold text-slate-800 dark:text-slate-200">{t("line_settings.steps_title")}</span>
                          <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 font-bold pl-1 text-[11px] sm:text-xs">
                            <li>{t("line_settings.step_chat_with_bot")}</li>
                            <li>{t("line_settings.step_send_number").replace("{code}", connectionCode)}</li>
                            <li>{t("line_settings.step_auto_done")}</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase block">
                        {t("line_settings.manual_label")}
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
                            t("line_settings.manual_ok_btn")
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold leading-normal">
                        💡 {t("line_settings.manual_hint")}
                      </p>
                    </div>

                    {/* Dynamic LINE Profile Preview Card */}
                    {modalProfilePreview && (
                      <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-850 rounded-2xl animate-scaleIn space-y-3.5 shadow-inner">
                        <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                          {t("line_settings.profile_checked_success")}
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
                            <span className="text-[11px] font-bold">{t("line_settings.profile_ready_for_alerts")}</span>
                          </div>
                        ) : (
                          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2 text-amber-600 dark:text-amber-400 leading-normal">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <div className="text-[10px] font-bold">
                              <span>{t("line_settings.profile_not_added_bot")} </span>
                              <p className="font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                                {t("line_settings.profile_not_added_bot_desc")}
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
                  {t("line_settings.cancel_btn")}
                </button>
                {pairingTab === "manual" && (
                  <button
                    type="button"
                    onClick={handleConfirmAddAdmin}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
                    disabled={!modalProfilePreview}
                  >
                    <Check className="w-4 h-4" />
                    <span>{t("line_settings.confirm_add_btn")}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {showPricingModal && workspaceId && (
        <PricingModal
          isOpen={showPricingModal}
          workspaceId={workspaceId}
          onClose={() => setShowPricingModal(false)}
        />
      )}

    </div>
  )
}
