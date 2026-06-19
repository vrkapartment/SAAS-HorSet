"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Building, ChevronDown, Check, RefreshCw, AlertCircle, LogOut, User, X } from "lucide-react"

interface Workspace {
  id: string
  name: string
}

interface MenuItem {
  path: string
  name: string
  icon: any
  onClick?: () => void
}

interface SidebarProps {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  userRole: "admin" | "staff" | "super_admin"
  workspaceLoading: boolean
  showDropdown: boolean
  setShowDropdown: (show: boolean) => void
  workspaces: Workspace[]
  currentWorkspace: Workspace
  handleSwitchWorkspace: (ws: Workspace) => void
  supportStatus: string
  handleRequestSupport: () => void
  handleExitSupport: () => void
  filteredMenu: MenuItem[]
  pathname: string
  safeNavigate: (path: string) => void
  handlePrefetchPage: (path: string) => void
  fullName: string
  isProfileLoaded: boolean
  isDemo: boolean
  handleLogout: () => void
  t: (key: string) => string
}

export default function Sidebar({
  mobileOpen,
  setMobileOpen,
  userRole,
  workspaceLoading,
  showDropdown,
  setShowDropdown,
  workspaces,
  currentWorkspace,
  handleSwitchWorkspace,
  supportStatus,
  handleRequestSupport,
  handleExitSupport,
  filteredMenu,
  pathname,
  safeNavigate,
  handlePrefetchPage,
  fullName,
  isProfileLoaded,
  isDemo,
  handleLogout,
  t
}: SidebarProps) {
  return (
    <>
      {/* Sidebar สำหรับหน้าจอขนาดใหญ่ (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 h-full glass-panel border-r border-slate-200/80 dark:border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-8 px-1 min-w-0">
          <div className="p-2.5 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-md shadow-blue-500/20 animate-pulse-subtle shrink-0">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent truncate whitespace-nowrap">
              {t("common.app_name") || "HorSet หอเสร็จ"}
            </h2>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium tracking-wide truncate whitespace-nowrap">{t("dashboard.system_subtitle")}</p>
          </div>
        </div>

        {userRole === "super_admin" && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-900/35 border border-slate-200/50 dark:border-slate-800/50 relative shadow-sm backdrop-blur-md">
            <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">{t("dashboard.select_workspace")}</label>
            
            <button
              onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
              disabled={workspaceLoading}
              className={`w-full flex items-center justify-between text-xs font-bold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 transition-all shadow-sm cursor-pointer ${
                workspaceLoading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
              }`}
            >
              {workspaceLoading && !isDemo ? (
                <span className="truncate max-w-[140px] flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  กำลังโหลด...
                </span>
              ) : (
                <span className="truncate max-w-[140px]">{currentWorkspace.name || "กำลังโหลด..."}</span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform duration-300" style={{ transform: showDropdown ? 'rotate(180deg)' : 'none' }} />
            </button>

            {showDropdown && (
              <div className="absolute left-0 right-0 mt-2 mx-4 bg-white/95 dark:bg-slate-950/95 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-xl z-30 p-1.5 space-y-1 backdrop-blur-xl">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={`w-full text-left text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer truncate whitespace-nowrap ${
                      currentWorkspace.id === ws.id
                        ? "bg-blue-600 text-white font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}

            {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน */}
            <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col gap-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 dark:text-slate-500 font-medium">{t("dashboard.support_access")}</span>
                {supportStatus === "approved" && (
                  <span className="text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-md text-[10px]">
                    <Check className="w-3 h-3" /> {t("dashboard.approved")}
                  </span>
                )}
                {supportStatus === "pending" && (
                  <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px]">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {t("dashboard.pending")}
                  </span>
                )}
                {(supportStatus === "revoked" || supportStatus === "none") && (
                  <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[10px]">
                    <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access")}
                  </span>
                )}
              </div>

              {(supportStatus === "none" || supportStatus === "revoked") && (
                <button
                  onClick={handleRequestSupport}
                  className="w-full mt-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-[10px] text-center transition-all shadow-md shadow-blue-500/15 hover:shadow-blue-500/25 active:translate-y-0 hover:-translate-y-0.5 cursor-pointer"
                >
                  {t("dashboard.request_support")}
                </button>
              )}

              {supportStatus === "pending" && (
                <div className="text-[9px] text-slate-500 text-left px-1 mt-0.5 font-medium animate-pulse">
                  {t("dashboard.awaiting_admin_approval")}
                </div>
              )}

              {supportStatus === "approved" && (
                <button
                  onClick={handleExitSupport}
                  className="w-full mt-1 py-2.5 px-4 bg-gradient-to-r from-red-600/90 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold rounded-xl text-[10px] transition-all shadow-md shadow-red-500/10 hover:shadow-red-500/20 flex items-center justify-between hover:-translate-y-0.5 active:translate-y-0 cursor-pointer min-w-0"
                >
                  <span className="truncate whitespace-nowrap mr-2">ออกจาก Workspace นี้</span>
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* รายการเมนู */}
        <nav className="flex-1 overflow-y-auto no-scrollbar space-y-1">
          {!isProfileLoaded && !isDemo ? (
            <div className="space-y-2 px-1">
              <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
              <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
            </div>
          ) : (
            filteredMenu.map((item) => {
              const Icon = item.icon
              const isActive = item.path !== "#profile" && pathname === item.path
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    if (item.onClick) {
                      item.onClick()
                    } else {
                      safeNavigate(item.path)
                    }
                  }}
                  onMouseEnter={() => handlePrefetchPage(item.path)}
                  onTouchStart={() => handlePrefetchPage(item.path)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 text-left cursor-pointer min-w-0 ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-600 dark:to-indigo-500 text-white shadow-lg shadow-blue-500/20 translate-x-1.5 scale-[1.01]"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-900/40 hover:text-blue-600 dark:hover:text-blue-400 hover:translate-x-1.5"
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-300 shrink-0 ${isActive ? "text-white scale-110" : "text-slate-500 dark:text-slate-400"}`} />
                  <span className="flex-1 [word-break:keep-all]">{item.name}</span>
                </button>
              )
            })
          )}
        </nav>

        {/* ข้อมูลโปรไฟล์ด้านล่าง */}
        <div className="pt-5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4">
          <div className="bg-slate-100/40 dark:bg-slate-900/20 border border-slate-200/40 dark:border-slate-800/30 rounded-2xl p-3 shadow-inner min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-200/50 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                <User className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 min-h-[16px] truncate whitespace-nowrap" title={fullName}>
                  {!isProfileLoaded && !isDemo ? (
                    <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                  ) : (
                    fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                  )}
                </h4>
                <span className={`inline-block text-[9px] px-2.5 py-0.5 rounded-full font-bold mt-1.5 truncate whitespace-nowrap max-w-full ${
                  userRole === "super_admin"
                    ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                    : userRole === "admin"
                    ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                    : "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
                }`}>
                  {userRole.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full bg-red-500/5 dark:bg-red-500/10 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 border border-red-500/10 hover:border-red-600 rounded-xl py-2.5 px-4 font-bold flex items-center justify-center gap-2.5 shadow-sm hover:shadow-md hover:shadow-red-500/15 hover:-translate-y-0.5 transition-all duration-300 text-red-500 dark:text-red-400 cursor-pointer min-w-0"
          >
            <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 shrink-0" />
            <span className="truncate whitespace-nowrap">{t("common.logout") || "ออกจากระบบ"}</span>
          </button>
        </div>
      </aside>

      {/* โมเดล Sidebar สำหรับอุปกรณ์พกพา (Mobile Drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-64 glass-panel h-full p-6 animate-slide-right">
            <div className="flex items-center justify-between mb-8 px-1 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-lg shadow-md shadow-blue-500/15 shrink-0">
                  <Building className="w-4.5 h-4.5 text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-md font-black tracking-tight bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent truncate whitespace-nowrap">
                    {t("common.app_name") || "HorSet หอเสร็จ"}
                  </h2>
                </div>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {userRole === "super_admin" && (
              <div className="mb-6 p-4 rounded-2xl bg-slate-100/70 dark:bg-slate-900/35 border border-slate-200/50 dark:border-slate-800/50 relative shadow-sm backdrop-blur-md">
                <label className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block mb-1.5 uppercase tracking-wider">{t("dashboard.select_workspace")}</label>
                <button
                  onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
                  disabled={workspaceLoading}
                  className={`w-full flex items-center justify-between text-xs font-bold bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200/80 dark:border-slate-800/80 transition-all shadow-sm cursor-pointer ${
                    workspaceLoading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  {workspaceLoading && !isDemo ? (
                    <span className="truncate flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                      กำลังโหลด...
                    </span>
                  ) : (
                    <span className="truncate">{currentWorkspace.name || "กำลังโหลด..."}</span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform duration-300" style={{ transform: showDropdown ? 'rotate(180deg)' : 'none' }} />
                </button>
                {showDropdown && (
                  <div className="absolute left-0 right-0 mt-2 mx-4 bg-white/95 dark:bg-slate-950/95 border border-slate-200/60 dark:border-slate-800/80 rounded-xl shadow-xl z-30 p-1.5 space-y-1 backdrop-blur-xl animate-fade-in">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className={`w-full text-left text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer truncate whitespace-nowrap ${
                          currentWorkspace.id === ws.id ? "bg-blue-600 text-white font-bold" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        {ws.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน ในมือถือ */}
                <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60 flex flex-col gap-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">{t("dashboard.support_access") || "สิทธิ์การช่วยเหลือ"}</span>
                    {supportStatus === "approved" && (
                      <span className="text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-md text-[10px]">
                        <Check className="w-3 h-3" /> {t("dashboard.approved") || "ได้รับสิทธิ์"}
                      </span>
                    )}
                    {supportStatus === "pending" && (
                      <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px]">
                        <RefreshCw className="w-3 h-3 animate-spin" /> {t("dashboard.pending") || "กำลังรอ"}
                      </span>
                    )}
                    {(supportStatus === "revoked" || supportStatus === "none") && (
                      <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-md text-[10px]">
                        <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access") || "ไม่มีสิทธิ์"}
                      </span>
                    )}
                  </div>

                  {(supportStatus === "none" || supportStatus === "revoked") && (
                    <button
                      onClick={handleRequestSupport}
                      className="w-full mt-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-[10px] text-center transition-all shadow-md shadow-blue-500/15 hover:shadow-blue-500/25 active:translate-y-0 hover:-translate-y-0.5 cursor-pointer"
                    >
                      {t("dashboard.request_support") || "ส่งคำขอเข้าช่วยเหลือระบบ"}
                    </button>
                  )}

                  {supportStatus === "pending" && (
                    <div className="text-[9px] text-slate-500 text-left px-1 mt-0.5 font-medium animate-pulse">
                      {t("dashboard.awaiting_admin_approval") || "รอดำเนินการอนุมัติสิทธิ์"}
                    </div>
                  )}

                  {supportStatus === "approved" && (
                    <button
                      onClick={handleExitSupport}
                      className="w-full mt-1 py-2.5 px-4 bg-gradient-to-r from-red-600/90 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold rounded-xl text-[10px] transition-all shadow-md shadow-red-500/10 hover:shadow-red-500/20 flex items-center justify-between hover:-translate-y-0.5 active:translate-y-0 cursor-pointer min-w-0"
                    >
                      <span className="truncate whitespace-nowrap mr-2">ออกจาก Workspace นี้</span>
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <nav className="flex-1 overflow-y-auto no-scrollbar space-y-1">
              {!isProfileLoaded && !isDemo ? (
                <div className="space-y-2 px-1">
                  <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
                  <div className="h-10 bg-slate-100 dark:bg-slate-900/60 rounded-xl animate-pulse" />
                </div>
              ) : (
                filteredMenu.map((item) => {
                  const Icon = item.icon
                  const isActive = item.path !== "#profile" && pathname === item.path
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        if (item.onClick) {
                          item.onClick()
                        } else {
                          safeNavigate(item.path)
                        }
                        setMobileOpen(false)
                      }}
                      onMouseEnter={() => handlePrefetchPage(item.path)}
                      onTouchStart={() => handlePrefetchPage(item.path)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-300 text-left cursor-pointer min-w-0 ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-600 dark:to-indigo-500 text-white shadow-lg shadow-blue-500/20 translate-x-1.5 scale-[1.01]"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-900/40 hover:text-blue-600 dark:hover:text-blue-400 hover:translate-x-1.5"
                      }`}
                    >
                      <Icon className={`w-4 h-4 transition-transform duration-300 shrink-0 ${isActive ? "text-white scale-110" : "text-slate-500 dark:text-slate-400"}`} />
                      <span className="flex-1 [word-break:keep-all]">{item.name}</span>
                    </button>
                  )
                })
              )}
            </nav>

            <div className="pt-5 border-t border-slate-200/60 dark:border-slate-800/60 space-y-4">
              <div className="bg-slate-100/40 dark:bg-slate-900/20 border border-slate-200/40 dark:border-slate-800/30 rounded-2xl p-3 shadow-inner min-w-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-200/50 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
                    <User className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 min-h-[16px] truncate whitespace-nowrap" title={fullName}>
                      {!isProfileLoaded && !isDemo ? (
                        <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                      ) : (
                        fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                      )}
                    </h4>
                    <span className={`inline-block text-[9px] px-2.5 py-0.5 rounded-full font-bold mt-1 truncate whitespace-nowrap max-w-full ${
                      userRole === "super_admin"
                        ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        : userRole === "admin"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        : "bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20"
                    }`}>
                      {userRole.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full bg-red-500/5 dark:bg-red-500/10 hover:bg-red-600 hover:text-white dark:hover:bg-red-600 border border-red-500/10 hover:border-red-600 rounded-xl py-2.5 px-4 font-bold flex items-center justify-center gap-2.5 shadow-sm hover:shadow-md hover:shadow-red-500/15 hover:-translate-y-0.5 transition-all duration-300 text-red-500 dark:text-red-400 cursor-pointer min-w-0"
              >
                <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5 shrink-0" />
                <span className="truncate whitespace-nowrap">{t("common.logout") || "ออกจากระบบ"}</span>
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
