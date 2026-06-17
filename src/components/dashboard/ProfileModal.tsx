"use client"

import React from "react"
import { X, User, AlertCircle, Check, KeyRound, Lock, RefreshCw } from "lucide-react"

interface ProfileModalProps {
  isOpen: boolean
  isDark: boolean
  profileLoading: boolean
  onClose: () => void
  profileName: string
  setProfileName: (name: string) => void
  profilePhone: string
  setProfilePhone: (phone: string) => void
  profilePassword: string
  setProfilePassword: (pass: string) => void
  profileConfirmPassword: string
  setProfileConfirmPassword: (pass: string) => void
  profileError: string | null
  profileSuccess: string | null
  onSubmit: (e: React.FormEvent) => void
}

export default function ProfileModal({
  isOpen,
  isDark,
  profileLoading,
  onClose,
  profileName,
  setProfileName,
  profilePhone,
  setProfilePhone,
  profilePassword,
  setProfilePassword,
  profileConfirmPassword,
  setProfileConfirmPassword,
  profileError,
  profileSuccess,
  onSubmit
}: ProfileModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/30 dark:bg-slate-950/75 backdrop-blur-md transition-all duration-300"
        onClick={() => !profileLoading && onClose()} 
      />
      
      <div className={`relative w-full max-w-md p-8 rounded-3xl border shadow-2xl animate-scale-up transition-colors duration-300 ${
        isDark 
          ? "bg-slate-900/98 border-slate-800/80 shadow-slate-950/80" 
          : "bg-white/98 border-slate-100 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.15)]"
      }`}>
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-teal-500 rounded-t-3xl animate-gradient-flow" />
        
        {/* Close button */}
        <button
          disabled={profileLoading}
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full transition-all duration-200 disabled:opacity-50 hover:scale-105 active:scale-95 cursor-pointer text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col space-y-6">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl border transition-all duration-300 shadow-sm ${
              isDark 
                ? "bg-blue-600/10 border-blue-500/25 text-blue-400 shadow-blue-500/5" 
                : "bg-gradient-to-tr from-blue-500/10 to-indigo-500/5 border-blue-100 text-blue-600 shadow-blue-500/10"
            }`}>
              <User className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className={`text-xl font-black tracking-tight transition-colors ${
                isDark ? "text-white" : "text-slate-850"
              }`}>
                ตั้งค่าโปรไฟล์ & รหัสผ่าน
              </h3>
              <p className={`text-xs mt-0.5 font-medium transition-colors ${
                isDark ? "text-slate-400" : "text-slate-550"
              }`}>
                แก้ไขข้อมูลส่วนตัวและรหัสผ่านเพื่อความปลอดภัยของระบบ
              </p>
            </div>
          </div>

          {profileError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20 rounded-xl flex items-center gap-3 text-xs text-rose-600 dark:text-rose-400 font-semibold animate-pulse shadow-sm">
              <AlertCircle className="w-4.5 h-4.5 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          {profileSuccess && (
            <div className="p-3.5 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl flex items-center gap-3 text-xs text-emerald-600 dark:text-emerald-400 font-bold shadow-sm">
              <Check className="w-4.5 h-4.5 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Full name input */}
            <div className="group relative flex flex-col space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-550 group-focus-within:text-blue-600"
              }`}>
                ชื่อ-นามสกุล
              </label>
              <div className="relative">
                <User className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  disabled={profileLoading}
                  placeholder="กรอกชื่อ-นามสกุลจริง"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                    isDark 
                      ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                      : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                  }`}
                />
              </div>
            </div>

            {/* Phone number input */}
            <div className="group relative flex flex-col space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-550 group-focus-within:text-blue-600"
              }`}>
                เบอร์โทรศัพท์
              </label>
              <div className="relative">
                <AlertCircle className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type="tel"
                  required
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  disabled={profileLoading}
                  placeholder="กรอกเบอร์โทรศัพท์มือถือ"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                    isDark 
                      ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                      : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                  }`}
                />
              </div>
            </div>

            {/* Beautiful fading gradient divider */}
            <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-6" />

            {/* Interactive Premium Suggestion Card */}
            <div className={`space-y-1.5 p-4 rounded-r-2xl border-l-4 transition-all duration-300 mb-2 shadow-sm ${
              isDark 
                ? "bg-blue-950/10 border-blue-500/50 text-blue-400 shadow-blue-950/10" 
                : "bg-gradient-to-r from-blue-50/50 to-indigo-50/30 border-blue-500 text-blue-700 shadow-blue-500/5"
            }`}>
              <p className="text-[11px] font-bold flex items-center gap-1.5 uppercase tracking-wide">
                <KeyRound className="w-3.5 h-3.5" /> แนะนำการเปลี่ยนรหัสผ่าน
              </p>
              <p className={`text-[10px] leading-relaxed font-medium ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}>
                กรอกข้อมูลด้านล่างเฉพาะเมื่อต้องการแก้ไขรหัสผ่านใหม่เท่านั้น หากไม่ต้องการแก้ไข ให้ปล่อยว่างช่องรหัสผ่านไว้ได้เลยครับ
              </p>
            </div>

            {/* New password input */}
            <div className="group relative flex flex-col space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-550 group-focus-within:text-blue-600"
              }`}>
                รหัสผ่านใหม่ (ระบุอย่างน้อย 6 ตัวอักษร)
              </label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type="password"
                  value={profilePassword}
                  onChange={(e) => setProfilePassword(e.target.value)}
                  disabled={profileLoading}
                  placeholder="ป้อนรหัสผ่านใหม่ หากต้องการเปลี่ยน"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                    isDark 
                      ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                      : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                  }`}
                />
              </div>
            </div>

            {/* Confirm new password input */}
            <div className="group relative flex flex-col space-y-1.5">
              <label className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${
                isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-550 group-focus-within:text-blue-600"
              }`}>
                ยืนยันรหัสผ่านใหม่
              </label>
              <div className="relative">
                <Lock className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type="password"
                  value={profileConfirmPassword}
                  onChange={(e) => setProfileConfirmPassword(e.target.value)}
                  disabled={profileLoading}
                  placeholder="ป้อนรหัสผ่านใหม่อีกครั้งเพื่อยืนยัน"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl text-xs outline-none transition-all disabled:opacity-50 border focus:ring-4 font-semibold ${
                    isDark 
                      ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-blue-500 focus:ring-blue-500/15 placeholder-slate-600" 
                      : "bg-slate-50/50 hover:bg-slate-50 border-slate-200/80 text-slate-850 focus:bg-white focus:border-blue-600 focus:ring-blue-500/8 placeholder-slate-400/80 shadow-sm"
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3.5 w-full pt-5">
              <button
                type="button"
                disabled={profileLoading}
                onClick={onClose}
                className={`py-3 px-4 font-extrabold rounded-xl text-xs transition-all duration-250 disabled:opacity-50 border cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${
                  isDark 
                    ? "bg-slate-800/85 border-slate-700/80 hover:bg-slate-750 text-slate-300 hover:text-white" 
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300 shadow-sm"
                }`}
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={profileLoading}
                className="py-3 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-black rounded-xl text-xs shadow-[0_6px_20px_rgba(37,99,235,0.22)] hover:shadow-[0_8px_25px_rgba(37,99,235,0.42)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {profileLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังบันทึก...</span>
                  </>
                ) : (
                  <span>บันทึกข้อมูล</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
