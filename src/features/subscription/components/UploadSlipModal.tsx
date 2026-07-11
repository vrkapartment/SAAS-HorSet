"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, Landmark, Loader2, RefreshCw, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { generatePromptPayPayload } from "@/lib/promptpay"
import {
  getHorSetPaymentInfo,
  uploadSubscriptionSlip,
  type HorSetPaymentInfo,
  type SaasPlan
} from "@/features/subscription/actions"
import { useWorkspaceSubscription } from "@/features/subscription/hooks/useWorkspaceSubscription"

interface UploadSlipModalProps {
  isOpen: boolean
  workspaceId: string
  /** แผนที่เลือกไว้แล้วจากหน้าเลือกแพ็กเกจ (PricingModal) — หน้านี้แสดงยืนยันอย่างเดียว ไม่ให้เลือกซ้ำ */
  plan: SaasPlan | null
  billingCycle: "monthly" | "yearly"
  onClose: () => void
  /** callback เสริมเมื่อชำระเงินสำเร็จ เช่น ให้ parent เรียก refetch subscription */
  onSuccess?: () => void
}

type SubmitResult = { success: boolean; retrying?: boolean; message: string }

// Bucket เดียวกับที่หน้า tenant portal ใช้อัปโหลดสลิปค่าเช่า (payment-slips) แต่แยก path เป็น saas-subscription-slips/
const STORAGE_BUCKET = "payment-slips"
const STORAGE_PATH_PREFIX = "saas-subscription-slips"

function getDaysRemaining(dateStr: string | null, nowMs: number | null): number | null {
  if (!dateStr || nowMs === null) return null
  return Math.ceil((new Date(dateStr).getTime() - nowMs) / (24 * 60 * 60 * 1000))
}

export default function UploadSlipModal({
  isOpen,
  workspaceId,
  plan,
  billingCycle,
  onClose,
  onSuccess
}: UploadSlipModalProps) {
  const { subscription } = useWorkspaceSubscription(workspaceId)

  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => {
    if (isOpen) setNowMs(Date.now())
  }, [isOpen])

  const [paymentInfo, setPaymentInfo] = useState<HorSetPaymentInfo | null>(null)
  const [paymentInfoError, setPaymentInfoError] = useState<string | null>(null)
  const [paymentInfoLoading, setPaymentInfoLoading] = useState(false)

  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  // QR ที่วาดรวมโลโก้ HorSet ไว้ตรงกลางแล้ว (ผ่าน canvas) — ใช้ pattern เดียวกับ QR พร้อมเพย์ของหอพักในหน้า Tenant Portal
  const [combinedQrUrl, setCombinedQrUrl] = useState<string>("")
  const [isQrLoading, setIsQrLoading] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setPaymentInfoLoading(true)
    setPaymentInfoError(null)

    getHorSetPaymentInfo()
      .then((res) => {
        if (cancelled) return
        if (res.success && res.data) {
          setPaymentInfo(res.data)
        } else {
          setPaymentInfoError(res.error || "ไม่สามารถดึงข้อมูลบัญชีรับเงินได้")
        }
      })
      .catch((err) => {
        if (!cancelled) setPaymentInfoError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลบัญชีรับเงิน")
      })
      .finally(() => {
        if (!cancelled) setPaymentInfoLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      setSlipFile(null)
      setSlipPreviewUrl(null)
      setResult(null)
      setUploading(false)
    }
  }, [isOpen])

  const amount = plan ? (billingCycle === "yearly" ? plan.priceYearly ?? plan.priceMonthly * 12 : plan.priceMonthly) : 0
  const qrPayload = paymentInfo?.promptpayId ? generatePromptPayPayload(paymentInfo.promptpayId, amount) : null
  const qrImageUrl = qrPayload
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrPayload)}&size=500x500&ecc=H`
    : null

  // วาด QR + โลโก้ HorSet ตรงกลางลงบน canvas (pattern เดียวกับ QR พร้อมเพย์ของหอพักในหน้า Tenant Portal)
  // เพื่อกันปัญหา QR เดิมที่ครอปมุมด้วย CSS rounded ตรงๆ จนดูล้นกรอบ/ไม่สวยงาม
  useEffect(() => {
    if (!isOpen || !qrImageUrl) {
      setCombinedQrUrl("")
      return
    }

    setIsQrLoading(true)

    const qrImg = new Image()
    qrImg.crossOrigin = "anonymous"
    qrImg.src = qrImageUrl

    qrImg.onload = () => {
      const canvas = document.createElement("canvas")
      canvas.width = 500
      canvas.height = 500
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        setCombinedQrUrl(qrImageUrl)
        setIsQrLoading(false)
        return
      }

      ctx.drawImage(qrImg, 0, 0, 500, 500)

      const logoImg = new Image()
      logoImg.src = "/icon-512x512.png"

      logoImg.onload = () => {
        try {
          const bgSize = 86
          const logoSize = 64
          const radius = 12
          const x = 250 - bgSize / 2
          const y = 250 - bgSize / 2

          ctx.fillStyle = "#ffffff"
          ctx.beginPath()
          ctx.moveTo(x + radius, y)
          ctx.arcTo(x + bgSize, y, x + bgSize, y + bgSize, radius)
          ctx.arcTo(x + bgSize, y + bgSize, x, y + bgSize, radius)
          ctx.arcTo(x, y + bgSize, x, y, radius)
          ctx.arcTo(x, y, x + bgSize, y, radius)
          ctx.closePath()
          ctx.fill()

          const lx = 250 - logoSize / 2
          const ly = 250 - logoSize / 2
          ctx.drawImage(logoImg, lx, ly, logoSize, logoSize)

          setCombinedQrUrl(canvas.toDataURL("image/png"))
        } catch (err) {
          console.error("Error drawing HorSet logo on QR canvas:", err)
          setCombinedQrUrl(canvas.toDataURL("image/png"))
        } finally {
          setIsQrLoading(false)
        }
      }

      logoImg.onerror = () => {
        try {
          setCombinedQrUrl(canvas.toDataURL("image/png"))
        } catch {
          setCombinedQrUrl(qrImageUrl)
        }
        setIsQrLoading(false)
      }
    }

    qrImg.onerror = () => {
      setCombinedQrUrl(qrImageUrl)
      setIsQrLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, qrImageUrl])

  if (!isOpen || !plan) return null

  const isTrial = subscription?.status === "trial"
  const trialDaysRemaining = isTrial ? getDaysRemaining(subscription?.trialEndsAt ?? null, nowMs) : null
  const showBonus = isTrial && trialDaysRemaining !== null && trialDaysRemaining > 0
  const cycleLabel = billingCycle === "yearly" ? "1 ปี" : "1 เดือน"

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setResult({ success: false, message: "ไฟล์รูปภาพมีขนาดใหญ่เกินไป (เกิน 5MB) กรุณาเลือกไฟล์ที่เล็กกว่านี้" })
      return
    }

    setSlipFile(file)
    setSlipPreviewUrl(URL.createObjectURL(file))
    setResult(null)
  }

  const handleSubmit = async () => {
    if (!slipFile) {
      setResult({ success: false, message: "กรุณาแนบรูปสลิปการโอนเงินก่อน" })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const supabase = createClient()
      const fileExt = slipFile.name.split(".").pop() || "jpg"
      const fileName = `${STORAGE_PATH_PREFIX}/${workspaceId}_${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(fileName, slipFile, {
          contentType: slipFile.type || "image/jpeg",
          cacheControl: "3600",
          upsert: true
        })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl }
      } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName)

      const res = await uploadSubscriptionSlip(workspaceId, plan.id, billingCycle, publicUrl)

      if (res.success) {
        setResult({ success: true, message: res.message || "ชำระเงินสำเร็จ! อัปเกรดแผนเรียบร้อยแล้ว" })
        onSuccess?.()
      } else if (res.retrying) {
        setResult({ success: false, retrying: true, message: res.error || "ระบบกำลังตรวจสอบสลิปนี้ให้อีกครั้งอัตโนมัติ กรุณารอสักครู่" })
      } else {
        setResult({ success: false, message: res.error || "ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" })
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการอัปโหลดสลิป กรุณาลองใหม่อีกครั้ง"
      })
    } finally {
      setUploading(false)
    }
  }

  const accountLabel = paymentInfo?.promptpayType === "phone" ? "เบอร์พร้อมเพย์" : "เลขบัญชี"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className="w-full max-w-md max-h-[90vh] p-5 sm:p-6 rounded-3xl relative shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        style={{ overflowY: "auto" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-all cursor-pointer z-10 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mb-4 pr-8">
          ชำระเงิน — {plan.name}
        </h3>

        {/* ยอดที่ต้องชำระ */}
        <div className="flex justify-between items-center p-4 rounded-2xl mb-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
          <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
            ยอดชำระ ({billingCycle === "yearly" ? "รายปี" : "รายเดือน"})
          </span>
          <span className="text-2xl font-black text-amber-600 dark:text-amber-400">
            ฿{amount.toLocaleString("th-TH")}
            <span className="text-xs font-bold text-slate-400">/{billingCycle === "yearly" ? "ปี" : "เดือน"}</span>
          </span>
        </div>

        {/* โบนัสวัน trial ที่เหลือ */}
        {showBonus && (
          <div className="flex items-start gap-2 p-3 rounded-2xl mb-4 border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 text-[11px] sm:text-xs font-bold text-blue-800 dark:text-blue-300 leading-relaxed">
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              โบนัส: ใช้ฟรีต่ออีก {trialDaysRemaining} วัน + {cycleLabel} เริ่มนับหลังหมด trial
            </span>
          </div>
        )}

        {paymentInfoLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> กำลังโหลดข้อมูลการชำระเงิน...
          </div>
        ) : paymentInfoError ? (
          <div className="flex items-center gap-2 p-3 rounded-2xl mb-4 border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4 shrink-0" /> {paymentInfoError}
          </div>
        ) : paymentInfo ? (
          <>
            {/* ข้อมูลการโอนเงิน */}
            <div className="space-y-2 mb-4">
              <h4 className="text-[11px] font-black text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" /> ข้อมูลการโอนเงิน
              </h4>
              <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-2 text-xs">
                {paymentInfo.bankName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-bold">ธนาคาร</span>
                    <span className="font-black text-slate-800 dark:text-slate-100">{paymentInfo.bankName}</span>
                  </div>
                )}
                {paymentInfo.promptpayName && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400 font-bold">ชื่อบัญชี</span>
                    <span className="font-black text-slate-800 dark:text-slate-100">{paymentInfo.promptpayName}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-bold">{accountLabel}</span>
                  <span className="font-mono font-black text-slate-800 dark:text-slate-100">{paymentInfo.promptpayId}</span>
                </div>
              </div>
            </div>

            {/* QR PromptPay */}
            <div className="space-y-2 mb-4">
              <h4 className="text-[11px] font-black text-slate-500 dark:text-slate-400">QR PromptPay</h4>
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/40 flex flex-col items-center gap-2">
                <div className="w-48 h-48 sm:w-56 sm:h-56 bg-white p-2 rounded-lg flex items-center justify-center shrink-0">
                  {isQrLoading ? (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
                      <span className="text-[9px] text-slate-400 font-medium">กำลังโหลด...</span>
                    </div>
                  ) : (
                    (combinedQrUrl || qrImageUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={combinedQrUrl || qrImageUrl || ""}
                        alt="พร้อมเพย์ QR ของ HorSet"
                        className="w-full h-full object-contain"
                      />
                    )
                  )}
                </div>
                <p className="text-xs font-black text-emerald-600 dark:text-emerald-400 text-center">
                  สแกนแล้วยอดขึ้นอัตโนมัติ ฿{amount.toLocaleString("th-TH")}
                </p>
                <p className="text-[11px] font-bold text-slate-400">PromptPay: {paymentInfo.promptpayId}</p>
              </div>
            </div>
          </>
        ) : null}

        {/* แนบสลิป */}
        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-black text-slate-500 dark:text-slate-400">
            อัปโหลดหลักฐานการชำระ *
          </label>
          <label
            className={`flex flex-col items-center justify-center gap-2 h-36 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
              slipPreviewUrl
                ? "border-blue-400 dark:border-blue-600"
                : "border-slate-300 dark:border-slate-700 hover:border-blue-400 dark:hover:border-blue-600"
            }`}
          >
            {slipPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={slipPreviewUrl} alt="ตัวอย่างสลิป" className="max-h-full object-contain rounded-xl" />
            ) : (
              <>
                <Upload className="w-6 h-6 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400">คลิกเพื่ออัปโหลดสลิป</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
        </div>

        {/* ผลลัพธ์ */}
        {result && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-start gap-2 mb-4 ${
              result.success
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                : result.retrying
                  ? "bg-amber-500/10 border border-amber-500/20 text-amber-500"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-500"
            }`}
          >
            {result.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : result.retrying ? (
              <RefreshCw className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{result.message}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 h-11 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={uploading || !slipFile}
            className="flex-[2] h-11 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {uploading ? "กำลังตรวจสอบสลิป..." : "ส่งหลักฐานการชำระ"}
          </button>
        </div>
      </div>
    </div>
  )
}
