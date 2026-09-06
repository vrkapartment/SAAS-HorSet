"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { AlertCircle, ArrowLeft, CheckCircle2, QrCode, Share2 } from "lucide-react"
import { buildPromptPayQrDataUrl } from "@/lib/promptpayQr"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { DynamicText } from "@/lib/translations/DynamicText"
import { LanguageToggle } from "@/components/LanguageToggle"
import { ThemeToggle } from "@/components/ThemeToggle"
import { usePortalData } from "../PortalDataProvider"

/**
 * หน้า QR พร้อมเพย์อย่างเดียว — เปิดจากปุ่ม "QR พร้อมเพย์" ใน rich menu
 *
 * ตัดทุกอย่างที่ไม่เกี่ยวออก เหลือแค่ QR ใหญ่ ๆ กับยอดที่ต้องจ่าย เพื่อให้ผู้เช่าสแกนหรือ
 * บันทึกภาพได้ในจังหวะเดียว ไม่ต้องเลื่อนหาในหน้าบิลที่ยาว
 *
 * ⚠️ ปุ่ม "ดาวน์โหลด" ตรง ๆ ใช้ไม่ได้ใน in-app browser ของ LINE (ถูกบล็อกแบบเงียบ ๆ)
 * ทางที่ทำงานจริงคือปุ่มแชร์ (navigator.share ส่งไฟล์) กับการกดค้างที่ภาพเพื่อบันทึก
 * จึงเขียนบอกไว้ใต้ภาพแทนที่จะใส่ปุ่มที่กดแล้วไม่เกิดอะไร
 */

type PortalQrData = {
  roomNumber?: string
  tenantName?: string
  promptPayId?: string
  promptPayName?: string
  workspaceName?: string
  workspaceLogo?: string
  bills?: { billingCycle?: string; amount?: number; status?: string }[]
}

function PortalQrContent() {
  const { t } = useLanguage()
  const { result, loading } = usePortalData()
  const searchParams = useSearchParams()

  const [qrUrl, setQrUrl] = useState("")
  const [qrLoading, setQrLoading] = useState(true)
  const [canShare, setCanShare] = useState(false)

  const data = (result?.success ? result.data : null) as PortalQrData | null

  /** บิลรอบปัจจุบัน = ใบล่าสุด (ฝั่ง server เรียงมาให้แล้ว) */
  const bill = useMemo(() => (data?.bills ?? [])[0] ?? null, [data])
  const amount = Number(bill?.amount ?? 0)
  const isPaid = bill?.status === "paid"
  const promptPayId = data?.promptPayId || ""

  // เช็คใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof navigator.share === "function") setCanShare(true)
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  // สร้างภาพ QR ใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    if (!promptPayId || !bill || isPaid) {
      const done = setTimeout(() => setQrLoading(false), 0)
      return () => clearTimeout(done)
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setQrLoading(true)
      const url = await buildPromptPayQrDataUrl({
        promptPayId,
        amount,
        logoUrl: data?.workspaceLogo
      })
      if (!cancelled) {
        setQrUrl(url)
        setQrLoading(false)
      }
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [promptPayId, amount, bill, isPaid, data?.workspaceLogo])

  const backHref = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("action")
    const qs = params.toString()
    return qs ? `/portal?${qs}` : "/portal"
  }, [searchParams])

  const handleShare = async () => {
    if (!qrUrl) return
    try {
      const res = await fetch(qrUrl)
      const blob = await res.blob()
      const file = new File([blob], `promptpay_${data?.roomNumber || "room"}.png`, {
        type: "image/png"
      })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t("tenant_portal.share_title").replace("{room}", data?.roomNumber || ""),
          text: t("tenant_portal.share_text_full")
            .replace("{room}", data?.roomNumber || "")
            .replace("{amount}", amount.toLocaleString())
        })
        return
      }

      await navigator.share({
        title: t("tenant_portal.share_title").replace("{room}", data?.roomNumber || ""),
        text: t("tenant_portal.share_text_fallback")
          .replace("{room}", data?.roomNumber || "")
          .replace("{amount}", amount.toLocaleString()),
        url: window.location.href
      })
    } catch (err) {
      console.error("Error sharing QR code:", err)
    }
  }

  /** แปลง "2026-09" เป็น "กันยายน 2026" ให้ตรงกับหน้าบิลและหน้าประวัติ */
  const formattedCycle = useMemo(() => {
    const cycle = bill?.billingCycle || ""
    if (!cycle.includes("-")) return cycle
    const [year, month] = cycle.split("-")
    const monthIdx = parseInt(month, 10) - 1
    if (monthIdx < 0 || monthIdx > 11) return cycle
    return `${t("dashboard.month_" + month)} ${year}`
  }, [bill, t])

  const formattedPromptPayId = useMemo(() => {
    if (!promptPayId) return ""
    return promptPayId.length === 10
      ? promptPayId.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")
      : promptPayId.replace(/(\d{1})(\d{4})(\d{5})(\d{2})(\d{1})/, "$1-$2-$3-$4-$5")
  }, [promptPayId])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 font-sans pb-12">
      <header className="glass-panel border-b border-slate-200/60 dark:border-slate-900/60 px-4 py-4 sticky top-0 z-20 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href={backHref}
            className="p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors shrink-0"
            aria-label={t("common.back")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-sm font-bold flex items-center gap-1.5 min-w-0">
              <QrCode className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="truncate">{t("tenant_portal.scan_promptpay_title")}</span>
            </h1>
            {data?.roomNumber && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                {t("tenant_portal.room_prefix_label").replace("{room}", data.roomNumber)}
                {data.tenantName ? <> · <DynamicText>{data.tenantName}</DynamicText></> : null}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {/* คุมความกว้างที่ div ข้างใน ไม่ใช่ที่ <main> เพราะ globals.css มีกฎ
          main { max-width: 100% !important } ที่ทับคลาส max-w-* ของ Tailwind ทิ้ง */}
      <main>
        <div className="max-w-md mx-auto px-4 pt-6 space-y-4">
          {loading && !data && (
            <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-10 text-center">
              <div className="w-10 h-10 mx-auto rounded-full border-4 border-slate-300 dark:border-slate-900 border-t-blue-500 animate-spin" />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">{t("tenant_portal.qr_loading")}</p>
            </div>
          )}

          {!loading && !promptPayId && (
            <div className="glass-card rounded-2xl border border-rose-500/25 bg-rose-500/5 p-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold">{t("tenant_portal.qr_no_promptpay_title")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                {t("tenant_portal.qr_no_promptpay_desc")}
              </p>
            </div>
          )}

          {!loading && promptPayId && !bill && (
            <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500">
                <QrCode className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold">{t("tenant_portal.no_bill_title")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                {t("tenant_portal.qr_no_bill_desc")}
              </p>
            </div>
          )}

          {!loading && promptPayId && bill && isPaid && (
            <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-8 text-center space-y-3">
              <CheckCircle2 className="w-14 h-14 text-teal-600 dark:text-teal-400 mx-auto" />
              <h2 className="text-base font-bold">{t("tenant_portal.payment_complete_title")}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
                {t("tenant_portal.qr_already_paid_desc")}
              </p>
            </div>
          )}

          {!loading && promptPayId && bill && !isPaid && (
            <>
              {/* ยอดที่ต้องจ่าย — ตัวใหญ่สุดในหน้า เพราะเป็นสิ่งที่ผู้เช่าต้องตรวจก่อนโอน */}
              <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-5 text-center space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {t("tenant_portal.invoice_cycle_label")} {formattedCycle}
                </span>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                  {amount.toLocaleString()} {t("daily_bills.baht_unit")}
                </p>
                <p className="text-[10px] text-slate-500 font-medium">{t("tenant_portal.auto_amount_note")}</p>
              </div>

              {/* ตัว QR */}
              <div className="glass-card rounded-2xl border border-slate-200/60 dark:border-slate-900/60 p-6 flex flex-col items-center gap-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  PromptPay EMVCo
                </div>

                <div className="w-full max-w-[300px] aspect-square bg-white p-3 rounded-2xl shadow-lg flex items-center justify-center">
                  {qrLoading || !qrUrl ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-9 h-9 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-[10px] text-slate-500 font-medium">
                        {t("tenant_portal.qr_loading")}
                      </span>
                    </div>
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={qrUrl} alt="PromptPay QR Code" className="w-full h-full object-contain" />
                  )}
                </div>

                {formattedPromptPayId && (
                  <div className="text-center space-y-0.5">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t("tenant_portal.promptpay_account_label")}{" "}
                      <span className="font-bold text-slate-900 dark:text-slate-200">{formattedPromptPayId}</span>
                    </p>
                    {data?.promptPayName && (
                      <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                        <DynamicText>{data.promptPayName}</DynamicText>
                      </p>
                    )}
                  </div>
                )}

                {canShare && (
                  <button
                    onClick={handleShare}
                    disabled={!qrUrl}
                    className={`w-full max-w-[300px] py-3 font-bold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors ${
                      qrUrl
                        ? "bg-blue-600 hover:bg-blue-500 text-white active:scale-[0.98]"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t("tenant_portal.share_save_btn")}</span>
                  </button>
                )}

                {/* บอกวิธีบันทึกที่ทำงานได้จริง แทนปุ่มดาวน์โหลดที่ LINE บล็อก */}
                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                  {t("tenant_portal.qr_save_hint")}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/** useSearchParams ต้องอยู่ใต้ Suspense ไม่งั้น Next บังคับให้ทั้งหน้าเป็น dynamic */
export default function PortalQrPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-[#070b14]" />}>
      <PortalQrContent />
    </Suspense>
  )
}
