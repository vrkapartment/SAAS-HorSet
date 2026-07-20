"use client"

import { Suspense, useEffect } from "react"
import Script from "next/script"
import { usePathname, useSearchParams } from "next/navigation"
import { GA_MEASUREMENT_ID, pageview } from "@/lib/analytics/gtag"
import { useCookieConsent } from "@/lib/analytics/CookieConsentContext"

function GAPageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const query = searchParams.toString()
    pageview(query ? `${pathname}?${query}` : pathname)
  }, [pathname, searchParams])

  return null
}

export function GoogleAnalytics() {
  const { status } = useCookieConsent()

  if (!GA_MEASUREMENT_ID || status !== "granted") return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true, cookie_domain: 'none' });
          window.gtag = gtag;
        `}
      </Script>
      <Suspense fallback={null}>
        <GAPageviewTracker />
      </Suspense>
    </>
  )
}
