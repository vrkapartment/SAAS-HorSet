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
      <aside className="hidden md:flex flex-col w-64 glass-panel border-r border-slate-200/80 dark:border-slate-900/60 p-6 z-20 shrink-0">
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-lg shadow-blue-500/10">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-wide flex items-center gap-1">
              {t("common.app_name") || "HorSet หอเสร็จ"}
            </h2>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">{t("dashboard.system_subtitle")}</p>
          </div>
        </div>

        {/* ส่วนจัดการ Workspace สำหรับ Super Admin */}
        {userRole === "super_admin" && (
          <div className="mb-6 p-4 rounded-2xl bg-slate-100 dark:bg-gradient-to-tr dark:from-slate-950 dark:to-slate-900 border border-slate-200 dark:border-slate-800 relative">
            <label className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold block mb-1.5 uppercase tracking-wider">{t("dashboard.select_workspace")}</label>
            
            <button
              onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
              disabled={workspaceLoading}
              className={`w-full flex items-center justify-between text-xs font-bold bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer ${
                workspaceLoading ? 'opacity-75 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
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
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showDropdown && (
              <div className="absolute left-0 right-0 mt-2 mx-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-30 p-1.5 space-y-1">
                {workspaces.map((ws) => (
                  <button
                    key={ws.id}
                    onClick={() => handleSwitchWorkspace(ws)}
                    className={`w-full text-left text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer ${
                      currentWorkspace.id === ws.id
                        ? "bg-blue-600 text-white font-medium"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {ws.name}
                  </button>
                ))}
              </div>
            )}

            {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน */}
            <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col gap-1.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t("dashboard.support_access")}</span>
                {supportStatus === "approved" && (
                  <span className="text-teal-400 font-semibold flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t("dashboard.approved")}
                  </span>
                )}
                {supportStatus === "pending" && (
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> {t("dashboard.pending")}
                  </span>
                )}
                {(supportStatus === "revoked" || supportStatus === "none") && (
                  <span className="text-red-400 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access")}
                  </span>
                )}
              </div>

              {(supportStatus === "none" || supportStatus === "revoked") && (
                <button
                  onClick={handleRequestSupport}
                  className="w-full mt-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-blue-600/10 cursor-pointer"
                >
                  {t("dashboard.request_support")}
                </button>
              )}

              {supportStatus === "pending" && (
                <div className="text-[9px] text-slate-500 text-left px-1 mt-1">
                  {t("dashboard.awaiting_admin_approval")}
                </div>
              )}

              {supportStatus === "approved" && (
                <button
                  onClick={handleExitSupport}
                  className="w-full mt-1.5 py-2 px-4 bg-red-600/90 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-red-600/10 flex items-center justify-between cursor-pointer"
                >
                  <span>ออกจาก Workspace นี้</span>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* รายการเมนู */}
        <nav className="flex-1 space-y-1">
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left cursor-pointer ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/15"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-slate-500 dark:text-slate-400"}`} />
                  {item.name}
                </button>
              )
            })
          )}
        </nav>

        {/* ข้อมูลโปรไฟล์ด้านล่าง */}
        <div className="pt-6 border-t border-slate-200 dark:border-slate-900 space-y-4">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-inner">
                <User className="w-5 h-5 text-slate-500 dark:text-slate-300" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px] flex items-center min-h-[16px]" title={fullName}>
                  {!isProfileLoaded && !isDemo ? (
                    <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                  ) : (
                    fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                  )}
                </h4>
                <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full font-bold mt-1 ${
                  userRole === "super_admin"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/20"
                    : userRole === "admin"
                    ? "bg-red-500/20 text-red-400 border border-red-500/20"
                    : "bg-teal-500/20 text-teal-400 border border-teal-500/20"
                }`}>
                  {userRole.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-medium text-left text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {t("common.logout") || "ออกจากระบบ"}
          </button>
        </div>
      </aside>

      {/* โมเดล Sidebar สำหรับอุปกรณ์พกพา (Mobile Drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex flex-col w-64 glass-panel h-full p-6 animate-slide-right">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <Building className="w-5 h-5 text-blue-500" />
                <h2 className="text-md font-bold">HorSet หอเสร็จ</h2>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1.5 text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {userRole === "super_admin" && (
              <div className="mb-6 p-4 rounded-2xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-900">
                <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block mb-1.5 uppercase">{t("dashboard.select_workspace")}</label>
                <button
                  onClick={() => !workspaceLoading && setShowDropdown(!showDropdown)}
                  disabled={workspaceLoading}
                  className={`w-full flex items-center justify-between text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 transition-all cursor-pointer ${
                    workspaceLoading ? 'opacity-75 cursor-not-allowed' : ''
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
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {showDropdown && (
                  <div className="absolute left-0 right-0 mt-2 mx-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-1.5 space-y-1 z-30">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        onClick={() => handleSwitchWorkspace(ws)}
                        className={`w-full text-left text-xs py-2 px-3 rounded-lg cursor-pointer ${
                          currentWorkspace.id === ws.id ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900"
                        }`}
                      >
                        {ws.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* แสดงสถานะ Support Permission ของ Workspace ปัจจุบัน ในมือถือ */}
                <div className="mt-3 pt-2.5 border-t border-slate-900 flex flex-col gap-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{t("dashboard.support_access") || "สิทธิ์การช่วยเหลือ"}</span>
                    {supportStatus === "approved" && (
                      <span className="text-teal-400 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" /> {t("dashboard.approved") || "ได้รับสิทธิ์"}
                      </span>
                    )}
                    {supportStatus === "pending" && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> {t("dashboard.pending") || "กำลังรอ"}
                      </span>
                    )}
                    {(supportStatus === "revoked" || supportStatus === "none") && (
                      <span className="text-red-400 font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {t("dashboard.no_access") || "ไม่มีสิทธิ์"}
                      </span>
                    )}
                  </div>

                  {(supportStatus === "none" || supportStatus === "revoked") && (
                    <button
                      onClick={handleRequestSupport}
                      className="w-full mt-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-blue-600/10 cursor-pointer"
                    >
                      {t("dashboard.request_support") || "ส่งคำขอเข้าช่วยเหลือระบบ"}
                    </button>
                  )}

                  {supportStatus === "pending" && (
                    <div className="text-[9px] text-slate-500 text-left px-1 mt-1">
                      {t("dashboard.awaiting_admin_approval") || "รอดำเนินการอนุมัติสิทธิ์"}
                    </div>
                  )}

                  {supportStatus === "approved" && (
                    <button
                      onClick={handleExitSupport}
                      className="w-full mt-1.5 py-2 px-4 bg-red-600/90 hover:bg-red-500 text-white font-medium rounded-lg text-[10px] text-left transition-colors shadow-lg shadow-red-600/10 flex items-center justify-between cursor-pointer"
                    >
                      <span>ออกจาก Workspace นี้</span>
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <nav className="flex-1 space-y-1">
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
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left cursor-pointer ${
                        isActive
                          ? "bg-blue-600 text-white"
                          : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900/50 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </button>
                  )
                })
              )}
            </nav>

            <div className="pt-6 border-t border-slate-200 dark:border-slate-900 space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <User className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[100px] flex items-center min-h-[16px]" title={fullName}>
                      {!isProfileLoaded && !isDemo ? (
                        <span className="inline-block bg-slate-200 dark:bg-slate-800 rounded w-16 h-3 animate-pulse" />
                      ) : (
                        fullName || (userRole === "super_admin" ? "ฝ่ายดูแลลูกค้า" : userRole === "admin" ? "คุณสมเจตน์" : "สมชาย")
                      )}
                    </h4>
                    <span className="text-[9px] text-slate-500 uppercase font-bold">{userRole}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-xs font-medium text-left text-red-400 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                {t("common.logout") || "ออกจากระบบ"}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
