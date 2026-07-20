"use client"

import Link from "next/link"
import { useCookieConsent } from "@/lib/analytics/CookieConsentContext"
import { useLanguage } from "@/lib/translations/LanguageProvider"

export function CookieConsentBanner() {
  const { status, grant, deny } = useCookieConsent()
  const { t } = useLanguage()

  if (status !== "pending") return null

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6">
      <div className="max-w-3xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-lg shadow-slate-900/10 dark:shadow-black/30 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 flex-1">
          {t("cookie_consent.message")}{" "}
          <Link href="/privacy-policy" className="underline hover:text-blue-600 dark:hover:text-blue-400">
            {t("cookie_consent.policy_link")}
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={deny}
            className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {t("cookie_consent.decline")}
          </button>
          <button
            type="button"
            onClick={grant}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {t("cookie_consent.accept")}
          </button>
        </div>
      </div>
    </div>
  )
}
