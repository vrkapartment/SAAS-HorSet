"use client"

import React, { useState, useEffect } from "react"
import { User, AlertCircle, Check, KeyRound, Lock, RefreshCw, Phone, Eye, EyeOff } from "lucide-react"
import { getCurrentUserProfileClient } from "@/features/auth/client"
import { updateUserProfileAction } from "@/features/auth/actions"
import { useLanguage } from "@/lib/translations/LanguageProvider"

function setCookie(name: string, value: string, days = 7) {
  if (typeof document === "undefined") return
  const date = new Date()
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:"
  document.cookie = `${name}=${value}; path=/; expires=${date.toUTCString()}${isSecure ? "; Secure" : ""}; SameSite=Lax`
}

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

export default function ProfileTab() {
  const { t } = useLanguage()
  const [profileLoading, setProfileLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  
  // Form values
  const [profileName, setProfileName] = useState("")
  const [profilePhone, setProfilePhone] = useState("")
  const [profilePassword, setProfilePassword] = useState("")
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("")
  
  // Status states
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  useEffect(() => {
    async function loadUserProfile() {
      setProfileLoading(true)
      try {
        if (!isDemo) {
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            setCurrentUser(res.data)
            setProfileName(res.data.full_name || "")
            setProfilePhone(res.data.phone || "")
          } else {
            setProfileError(t("profile_settings.err_profile"))
          }
        } else {
          // Demo Mode
          const userRole = getCookie("horset_user_role") || "admin"
          const savedName = getCookie(`horset_demo_profile_name_${userRole}`)
          const savedPhone = getCookie(`horset_demo_profile_phone_${userRole}`)
          
          const defaultName = userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย"
          const defaultPhone = "089-999-9999"
          
          setProfileName(savedName || defaultName)
          setProfilePhone(savedPhone || defaultPhone)
        }
      } catch (err) {
        console.error("Error loading profile tab:", err)
        setProfileError(t("profile_settings.err_connection"))
      } finally {
        setProfileLoading(false)
      }
    }
    loadUserProfile()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setProfileError(null)
    setProfileSuccess(null)

    if (!profileName.trim()) {
      setProfileError(t("profile_settings.err_empty_name"))
      return
    }

    if (profilePassword) {
      if (profilePassword.length < 6) {
        setProfileError(t("profile_settings.err_password_short"))
        return
      }
      if (profilePassword !== profileConfirmPassword) {
        setProfileError(t("profile_settings.err_password_mismatch"))
        return
      }
    }

    setSubmitting(true)

    if (!isDemo) {
      try {
        const res = (await updateUserProfileAction({
          fullName: profileName.trim(),
          phone: profilePhone.trim(),
          password: profilePassword || undefined
        })) as any

        if (res.success) {
          setProfileSuccess(t("profile_settings.success_update"))
          setProfilePassword("")
          setProfileConfirmPassword("")
          
          // Refresh client profile cache
          await getCurrentUserProfileClient(true)
          
          // Fire custom event to notify parent layout to refresh its visual header
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("profile-updated", { detail: { name: profileName } }))
          }
        } else {
          setProfileError(res.error || t("profile_settings.err_update_generic"))
        }
      } catch (err) {
        console.error("Error updating profile:", err)
        setProfileError(t("profile_settings.err_update_connection"))
      } finally {
        setSubmitting(false)
      }
    } else {
      // Demo Mode
      setTimeout(() => {
        const userRole = getCookie("horset_user_role") || "admin"
        setCookie(`horset_demo_profile_name_${userRole}`, profileName)
        setCookie(`horset_demo_profile_phone_${userRole}`, profilePhone)
        setProfileSuccess(t("profile_settings.success_update_demo"))
        setProfilePassword("")
        setProfileConfirmPassword("")
        setSubmitting(false)
        
        // Fire custom event
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("profile-updated", { detail: { name: profileName } }))
        }
      }, 1000)
    }
  }

  if (profileLoading) {
    return (
      <div className="py-24 text-center text-slate-500 text-xs font-bold">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
        <span>{t("profile_settings.loading")}</span>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 1. Header Section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-blue-600/10 to-indigo-600/10 p-6 rounded-3xl border border-blue-500/20 shadow-sm backdrop-blur-md">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2.5">
            <User className="w-6 h-6 text-blue-500 dark:text-blue-400" />
            <span>{t("profile_settings.title")}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            {t("profile_settings.subtitle")}
          </p>
        </div>
      </div>

      {/* 2. Form section */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-3xl p-6 sm:p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* Alerts */}
          {profileError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm font-bold flex items-center gap-2.5 text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-5 h-5 shrink-0 animate-pulse" />
              <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs sm:text-sm font-bold flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
              <Check className="w-5 h-5 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {/* Group 1: General Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {t("profile_settings.general_header")}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Full name input */}
              <div className="group relative flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-focus-within:text-blue-500">
                  {t("profile_settings.name_label")}
                </label>
                <div className="relative font-bold">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-500" />
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    disabled={submitting}
                    placeholder={t("profile_settings.name_placeholder")}
                    className="w-full pl-11 pr-4 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-850 text-slate-850 dark:text-slate-100 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-bold transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Phone number input */}
              <div className="group relative flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-focus-within:text-blue-500">
                  {t("profile_settings.phone_label")}
                </label>
                <div className="relative font-bold">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-500" />
                  <input
                    type="tel"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    disabled={submitting}
                    placeholder={t("profile_settings.phone_placeholder")}
                    className="w-full pl-11 pr-4 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-850 text-slate-850 dark:text-slate-100 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-mono font-bold transition-all disabled:opacity-50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Beautiful fading gradient divider */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-6" />

          {/* Group 2: Password Change */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-500" /> 
                <span>{t("profile_settings.security_header")}</span>
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                {t("profile_settings.security_desc")}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* New password input */}
              <div className="group relative flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-focus-within:text-blue-500">
                  {t("profile_settings.password_label")}
                </label>
                <div className="relative font-bold">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    disabled={submitting}
                    placeholder={t("profile_settings.password_placeholder")}
                    className="w-full pl-11 pr-11 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-850 text-slate-850 dark:text-slate-100 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-bold transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm new password input */}
              <div className="group relative flex flex-col space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 group-focus-within:text-blue-500">
                  {t("profile_settings.confirm_password_label")}
                </label>
                <div className="relative font-bold">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400 group-focus-within:text-blue-500" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={profileConfirmPassword}
                    onChange={(e) => setProfileConfirmPassword(e.target.value)}
                    disabled={submitting}
                    placeholder={t("profile_settings.confirm_password_placeholder")}
                    className="w-full pl-11 pr-11 py-3 rounded-xl text-xs bg-slate-50 dark:bg-slate-950 border border-slate-250 dark:border-slate-850 text-slate-850 dark:text-slate-100 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none font-bold transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Action */}
          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-5 h-5 text-white animate-spin" />
                  <span>{t("profile_settings.saving")}</span>
                </>
              ) : (
                <>
                  <span>{t("profile_settings.save_btn")}</span>
                </>
              )}
            </button>
          </div>

        </form>
      </div>
    </div>
  )
}
