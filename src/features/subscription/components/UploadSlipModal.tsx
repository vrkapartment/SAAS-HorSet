"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, Upload, X } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { listSaasPlans, uploadSubscriptionSlip, type SaasPlan } from "@/features/subscription/actions"

interface UploadSlipModalProps {
  isOpen: boolean
  workspaceId: string
  onClose: () => void
  /** เลือกแผนไว้ล่วงหน้า เช่น เมื่อกดปุ่ม "เลือกแผนนี้" มาจาก PricingTable */
  initialPlanId?: string
  initialBillingCycle?: "monthly" | "yearly"
  /** callback เสริมเมื่อชำระเงินสำเร็จ เช่น ให้ parent เรียก refetch subscription */
  onSuccess?: () => void
}

type SubmitResult = { success: boolean; retrying?: boolean; message: string }

// Bucket เดียวกับที่หน้า tenant portal ใช้อัปโหลดสลิปค่าเช่า (payment-slips) แต่แยก path เป็น saas-subscription-slips/
const STORAGE_BUCKET = "payment-slips"
const STORAGE_PATH_PREFIX = "saas-subscription-slips"

export default function UploadSlipModal({
  isOpen,
  workspaceId,
  onClose,
  initialPlanId,
  initialBillingCycle,
  onSuccess
}: UploadSlipModalProps) {
  const [plans, setPlans] = useState<SaasPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [plansError, setPlansError] = useState<string | null>(null)

  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlanId || "")
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(initialBillingCycle || "monthly")

  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreviewUrl, setSlipPreviewUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<SubmitResult | null>(null)

  // โหลดรายการแผนใหม่ทุกครั้งที่เปิด modal
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setPlansLoading(true)
    setPlansError(null)

    listSaasPlans()
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setPlans(res.data || [])
          if (!selectedPlanId && res.data && res.data.length > 0) {
            setSelectedPlanId(res.data[0].id)
          }
        } else {
          setPlansError(res.error || "ไม่สามารถดึงข้อมูลแผนการใช้งานได้")
        }
      })
      .catch((err) => {
        if (!cancelled) setPlansError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดึงข้อมูลแผนการใช้งาน")
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // ล้าง state เมื่อปิด modal เพื่อไม่ให้ค้างข้อมูลของรอบก่อนหน้า
  useEffect(() => {
    if (!isOpen) {
      setSlipFile(null)
      setSlipPreviewUrl(null)
      setResult(null)
      setUploading(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null
  const amount = selectedPlan
    ? billingCycle === "yearly"
      ? selectedPlan.priceYearly ?? selectedPlan.priceMonthly * 12
      : selectedPlan.priceMonthly
    : null

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
    if (!selectedPlanId) {
      setResult({ success: false, message: "กรุณาเลือกแผนการใช้งานก่อน" })
      return
    }
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

      const res = await uploadSubscriptionSlip(workspaceId, selectedPlanId, billingCycle, publicUrl)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-3xl relative shadow-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-all cursor-pointer z-10 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 mb-4">อัปเกรดแผนการใช้งาน HorSet</h3>

        {/* เลือกแผน */}
        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">เลือกแผนการใช้งาน</label>
          {plansLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังโหลดแผน...
            </div>
          ) : plansError ? (
            <div className="flex items-center gap-2 text-xs text-rose-500 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {plansError}
            </div>
          ) : (
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* เลือกรอบบิล */}
        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">รอบการชำระเงิน</label>
          <div className="inline-flex w-full p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setBillingCycle("monthly")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingCycle === "monthly"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              รายเดือน
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle("yearly")}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                billingCycle === "yearly"
                  ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              รายปี
            </button>
          </div>
        </div>

        {/* ยอดที่ต้องชำระ */}
        {amount !== null && (
          <div className="flex justify-between items-center p-3 rounded-2xl mb-4 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">ยอดที่ต้องชำระ</span>
            <span className="text-lg font-black text-teal-600 dark:text-teal-400">{amount.toLocaleString("th-TH")} บาท</span>
          </div>
        )}

        {/*
          TODO: ต่อ QR code ของ HorSet เองเมื่อมี public action ดึงค่า promptpay ของ HorSet
          (ปัจจุบัน getHorSetSlipOkCredentials ใน features/subscription/actions.ts ดึงเฉพาะ
          Branch ID / API Key ของ SlipOK ไม่ได้ export ค่า HORSET_PROMPTPAY_ID ออกมาให้ client ใช้)
          เมื่อมี action เช่น getHorSetPromptPayInfo() ที่ return { promptpayId, promptpayName } แล้ว
          ให้เรียก generatePromptPayPayload(promptpayId, amount) จาก src/lib/promptpay.ts
          แล้วนำ payload ไปสร้าง QR (เช่นด้วยไลบรารี qrcode.react) แสดงแทนกล่องข้อความด้านล่างนี้
        */}
        <div className="flex items-start gap-2 p-3 rounded-2xl mb-4 border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            กรุณาโอนเงินตามยอดด้านบนผ่านบัญชี PromptPay ของ HorSet ที่ได้รับแจ้งจากทีมงาน แล้วแนบสลิปการโอนเงินด้านล่างเพื่อยืนยันการชำระเงิน
          </span>
        </div>

        {/* แนบสลิป */}
        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">แนบรูปสลิปการโอนเงิน</label>
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
                <span className="text-xs font-semibold text-slate-400">แตะเพื่อเลือกรูปสลิป</span>
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

        <button
          type="button"
          onClick={handleSubmit}
          disabled={uploading || !slipFile || !selectedPlanId}
          className="w-full h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {uploading ? "กำลังตรวจสอบสลิป..." : "ยืนยันการชำระเงิน"}
        </button>
      </div>
    </div>
  )
}
