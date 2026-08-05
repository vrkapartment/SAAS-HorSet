"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Building,
  Landmark,
  Shield,
  Network,
  User,
  Settings,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  ShieldCheck,
  Package,
  HardDrive,
  Layers3
} from "lucide-react"

import { getCurrentUserProfileClient } from "@/features/auth/client"
import { type StaffPermissions, DEFAULT_STAFF_PERMISSIONS, ADMIN_DEFAULT_PERMISSIONS } from "@/features/permissions/types"

// Lazy load or import setting tabs
import PropertySettingsTab from "@/components/settings/PropertySettingsTab"
import FinanceSettingsTab from "@/components/settings/FinanceSettingsTab"
import PermissionsTab from "@/components/settings/PermissionsTab"
import TestConnectionTab from "@/components/settings/TestConnectionTab"
import ProfileTab from "@/components/settings/ProfileTab"
import LineSettingsTab from "@/components/settings/LineSettingsTab"
import SlipOkSettingsTab from "@/components/settings/SlipOkSettingsTab"
import PackageSettingsTab from "@/components/settings/PackageSettingsTab"
import GoogleDriveSettingsTab from "@/components/settings/GoogleDriveSettingsTab"
import { useLanguage } from "@/lib/translations/LanguageProvider"

type SettingsUserRole = "admin" | "staff" | "super_admin" | "tenant"

interface SettingsUserProfile {
  role: SettingsUserRole
  permissions?: StaffPermissions | string | null
}

function SettingsHubContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useLanguage()
  const requestedTab = searchParams.get("tab") || "profile"

  const [currentUser, setCurrentUser] = useState<SettingsUserProfile | null>(null)
  const [userPermissions, setUserPermissions] = useState<StaffPermissions | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  const isDemo = !process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")

  useEffect(() => {
    async function loadUserData() {
      setLoading(true)
      try {
        if (!isDemo) {
          const res = await getCurrentUserProfileClient()
          if (res.success && res.data) {
            const profile = res.data as SettingsUserProfile
            setCurrentUser(profile)
            
            // Load and parse permissions
            const isUserAdminOrSuper = profile.role === "admin" || profile.role === "super_admin"
            const defaultPerms = isUserAdminOrSuper ? ADMIN_DEFAULT_PERMISSIONS : DEFAULT_STAFF_PERMISSIONS

            if (profile.permissions) {
              let parsedPermissions: Partial<StaffPermissions> = {}
              if (typeof profile.permissions === "string") {
                try {
                  parsedPermissions = JSON.parse(profile.permissions) as Partial<StaffPermissions>
                } catch {
                  parsedPermissions = {}
                }
              } else {
                parsedPermissions = profile.permissions
              }
              setUserPermissions({ ...defaultPerms, ...parsedPermissions })
            } else {
              setUserPermissions(defaultPerms)
            }
          } else {
            setErrorKey("settings_hub.err_permissions")
          }
        } else {
          // Demo Mode
          const roleFromCookie = document.cookie
            .split("; ")
            .find((row) => row.startsWith("horset_user_role="))
            ?.split("=")[1] || "admin"
          const userRole: SettingsUserRole = ["admin", "staff", "super_admin", "tenant"].includes(roleFromCookie)
            ? roleFromCookie as SettingsUserRole
            : "admin"

          setCurrentUser({ role: userRole })
          setUserPermissions(ADMIN_DEFAULT_PERMISSIONS)
        }
      } catch (err) {
        console.error("Error loading user profile in settings hub:", err)
        setErrorKey("settings_hub.err_staff_permissions")
      } finally {
        setLoading(false)
      }
    }
    loadUserData()
  }, [isDemo])

  const handleTabChange = (tabId: string) => {
    router.push(`/settings?tab=${tabId}`)
  }

  if (loading) {
    return (
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>{t("settings_hub.loading")}</span>
      </div>
    )
  }

  if (errorKey) {
    return (
      <div className="p-6 text-center max-w-xl mx-auto space-y-4 py-24 min-h-[60vh] flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20 mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">{t("settings_hub.error_title")}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 font-bold">{t(errorKey)}</p>
      </div>
    )
  }

  // Keep the existing tab IDs and permission rules intact. Groups only change
  // how the settings navigation is presented; they do not change data access.
  const settingsGroups = [
    {
      id: "account",
      name: t("settings_hub.groups.account.name"),
      description: t("settings_hub.groups.account.description"),
      icon: User
    },
    {
      id: "business",
      name: t("settings_hub.groups.business.name"),
      description: t("settings_hub.groups.business.description"),
      icon: Building
    },
    {
      id: "automation",
      name: t("settings_hub.groups.automation.name"),
      description: t("settings_hub.groups.automation.description"),
      icon: Layers3
    },
    {
      id: "team",
      name: t("settings_hub.groups.team.name"),
      description: t("settings_hub.groups.team.description"),
      icon: Shield
    },
    {
      id: "advanced",
      name: t("settings_hub.groups.advanced.name"),
      description: t("settings_hub.groups.advanced.description"),
      icon: Settings
    }
  ] as const

  // Define tabs definition with permissions checking
  const allTabs = [
    {
      id: "profile",
      name: t("settings_hub.tabs.profile.name"),
      icon: User,
      description: t("settings_hub.tabs.profile.description"),
      group: "account",
      allowed: true // Always allowed for logged in users
    },
    {
      id: "package",
      name: t("settings_hub.tabs.package.name"),
      icon: Package,
      description: t("settings_hub.tabs.package.description"),
      group: "account",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    },
    {
      id: "property",
      name: t("settings_hub.tabs.property.name"),
      icon: Building,
      description: t("settings_hub.tabs.property.description"),
      group: "business",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_property_settings
    },
    {
      id: "finance",
      name: t("settings_hub.tabs.finance.name"),
      icon: Landmark,
      description: t("settings_hub.tabs.finance.description"),
      group: "business",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_finance_settings
    },
    {
      id: "slipok",
      name: t("settings_hub.tabs.slipok.name"),
      icon: ShieldCheck,
      description: t("settings_hub.tabs.slipok.description"),
      group: "business",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    },
    {
      id: "line-oa",
      name: t("settings_hub.tabs.line_oa.name"),
      icon: MessageSquare,
      description: t("settings_hub.tabs.line_oa.description"),
      group: "automation",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    },
    {
      id: "google_drive",
      name: t("settings_hub.tabs.google_drive.name"),
      icon: HardDrive,
      description: t("settings_hub.tabs.google_drive.description"),
      group: "automation",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    },
    {
      id: "permissions",
      name: t("settings_hub.tabs.permissions.name"),
      icon: Shield,
      description: t("settings_hub.tabs.permissions.description"),
      group: "team",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin" || !!userPermissions?.manage_staff_permissions
    },
    {
      id: "supabase",
      name: t("settings_hub.tabs.supabase.name"),
      icon: Network,
      description: t("settings_hub.tabs.supabase.description"),
      group: "advanced",
      allowed: currentUser?.role === "super_admin" || currentUser?.role === "admin"
    }
  ]

  const allowedTabs = allTabs.filter(tab => tab.allowed)
  const visibleGroups = settingsGroups
    .map(group => ({
      ...group,
      tabs: allowedTabs.filter(tab => tab.group === group.id)
    }))
    .filter(group => group.tabs.length > 0)
  
  // Make sure if selected tab is not allowed, fallback to first allowed tab (profile)
  const currentTabAllowed = allowedTabs.some(tab => tab.id === requestedTab)
  const resolvedActiveTab = currentTabAllowed ? requestedTab : "profile"
  const activeTabMeta = allowedTabs.find(tab => tab.id === resolvedActiveTab) || allowedTabs[0]
  const activeGroup = visibleGroups.find(group => group.id === activeTabMeta?.group) || visibleGroups[0]

  const renderActiveTabContent = () => {
    switch (resolvedActiveTab) {
      case "profile":
        return <ProfileTab />
      case "property":
        return <PropertySettingsTab />
      case "finance":
        return <FinanceSettingsTab />
      case "permissions":
        return <PermissionsTab />
      case "supabase":
        return <TestConnectionTab />
      case "line-oa":
        return <LineSettingsTab />
      case "slipok":
        return <SlipOkSettingsTab />
      case "package":
        return <PackageSettingsTab />
      case "google_drive":
        return <GoogleDriveSettingsTab />
      default:
        return <ProfileTab />
    }
  }

  return (
    <div className="space-y-6 w-full pb-16">
      {/* Settings navigation stays horizontal so it does not compete with the app sidebar. */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-sm">
        {/* Mobile: one compact grouped control. */}
        <div className="md:hidden">
          <label htmlFor="settings-section" className="block px-1 pb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
            {t("settings_hub.select_label")}
          </label>
          <select
            id="settings-section"
            value={resolvedActiveTab}
            onChange={(event) => handleTabChange(event.target.value)}
            className="w-full h-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
          >
            {visibleGroups.map(group => (
              <optgroup key={group.id} label={group.name}>
                {group.tabs.map(tab => (
                  <option key={tab.id} value={tab.id}>{tab.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Desktop: category row followed by only the selected category's pages. */}
        <nav className="hidden md:block" aria-label={t("settings_hub.nav_aria_label")}>
          <div className="flex items-center gap-1 overflow-x-auto pb-2 border-b border-slate-100 dark:border-slate-800">
            {visibleGroups.map(group => {
              const GroupIcon = group.icon
              const isSelected = activeGroup?.id === group.id
              return (
                <button
                  type="button"
                  key={group.id}
                  onClick={() => handleTabChange(group.tabs[0].id)}
                  className={`shrink-0 flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  <GroupIcon className="w-4 h-4" />
                  {group.name}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-2 pt-2.5">
            {activeGroup?.tabs.map(tab => {
              const Icon = tab.icon
              const isSelected = resolvedActiveTab === tab.id
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  aria-current={isSelected ? "page" : undefined}
                  className={`min-w-[190px] flex-1 flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-blue-500/40 bg-blue-600/10 text-blue-700 dark:text-blue-300 shadow-sm"
                      : "border-transparent bg-slate-50/80 dark:bg-slate-950/60 text-slate-600 dark:text-slate-300 hover:border-slate-200 dark:hover:border-slate-700"
                  }`}
                >
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black">{tab.name}</span>
                    <span className="mt-0.5 block truncate text-[9px] font-medium text-slate-400 dark:text-slate-500">{tab.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      </div>

      {/* Existing tab components and their save behavior remain untouched. */}
      <div className="w-full min-w-0 bg-transparent">
        <div key={resolvedActiveTab} className="animate-fade-in duration-300">
          {renderActiveTabContent()}
        </div>
      </div>
    </div>
  )
}

export default function SettingsHubPage() {
  const { t } = useLanguage()

  return (
    <Suspense fallback={
      <div className="py-32 text-center text-slate-500 text-xs font-bold flex flex-col items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-4" />
        <span>{t("settings_hub.opening")}</span>
      </div>
    }>
      <SettingsHubContent />
    </Suspense>
  )
}
