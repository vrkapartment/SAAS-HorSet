"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Script from "next/script"
import { AlertTriangle, ArrowRightLeft, Lock, RotateCcw, X } from "lucide-react"
import { previewRevertCheckout, revertCheckout } from "@/features/tenant/revert-checkout-actions"
import type { RevertCheckoutPlan } from "@/features/tenant/revert-checkout"

/**
 * ยกเลิกการคืนห้อง/ย้ายออก — ยืนยัน 2 ชั้น + รหัสผ่าน Admin
 *
 * feature: tenant · role ที่เห็น: Admin ของหอเท่านั้น
 *
 * ขั้นตอน:
 *   1. ตรวจกับฐานข้อมูลก่อน (dry run) ว่าย้อนได้ไหม และมีผู้เช่าห้องอื่นย้ายเข้ามาทับหรือไม่
 *   2. ยืนยันการยกเลิกการคืนห้อง
 *   3. ถ้ามีผู้เช่าย้ายเข้ามาทับ → ยืนยันอีกรอบว่าจะย้ายผู้เช่ารายนั้นกลับห้องเดิม
 *   4. กรอกรหัสผ่านของ Admin แล้วจึงทำจริง
 */

type Step = "loading" | "blocked" | "confirm" | "confirm_transfer" | "password"

export default function RevertCheckoutModal({
  contract,
  onClose,
  onSuccess
}: {
  contract: { id: string; roomNumber: string; tenantName: string }
  onClose: () => void
  onSuccess: (plan: RevertCheckoutPlan) => void
}) {
  const [step, setStep] = useState<Step>("loading")
  const [plan, setPlan] = useState<RevertCheckoutPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Cloudflare Turnstile — Supabase เปิด CAPTCHA ของการล็อกอินไว้ การยืนยันรหัสผ่านจึงต้องแนบโทเค็น
  // (ค่า fallback คือ test key ของ Cloudflare เหมือนหน้า login)
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "1x00000000000000000000AA"
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  const renderTurnstile = useCallback(() => {
    if (typeof window === "undefined" || !window.turnstile) return
    if (!turnstileContainerRef.current || widgetIdRef.current) return
    try {
      widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => setCaptchaToken(token),
        "error-callback": () => setCaptchaToken(null),
        "expired-callback": () => setCaptchaToken(null),
        theme: "auto"
      })
    } catch (err) {
      console.error("Turnstile render error:", err)
    }
  }, [turnstileSiteKey])

  // โทเค็นใช้ได้ครั้งเดียว — ยืนยันไม่ผ่านต้องขอใหม่
  const resetTurnstile = () => {
    setCaptchaToken(null)
    if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
      try { window.turnstile.reset(widgetIdRef.current) } catch { /* widget ถูกถอดไปแล้ว */ }
    }
  }

  useEffect(() => {
    if (step === "password") renderTurnstile()
  }, [step, renderTurnstile])

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.turnstile && widgetIdRef.current) {
        try { window.turnstile.remove(widgetIdRef.current) } catch { /* ไม่มี widget แล้ว */ }
        widgetIdRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    previewRevertCheckout(contract.id).then(res => {
      if (cancelled) return
      if (res.success) {
        setPlan(res.data)
        setStep("confirm")
      } else {
        setError(res.error)
        setStep("blocked")
      }
    })
    return () => { cancelled = true }
  }, [contract.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plan || submitting) return
    if (!password) {
      setError("กรุณากรอกรหัสผ่านของบัญชี Admin")
      return
    }
    if (!captchaToken) {
      setError("กรุณาผ่านการตรวจสอบความปลอดภัย (Cloudflare) ก่อน")
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await revertCheckout({
      contractId: contract.id,
      password,
      expectedTransferId: plan.transfer?.id ?? null,
      captchaToken
    })
    setSubmitting(false)
    if (res.success) {
      onSuccess(res.data)
    } else {
      setError(res.error)
      setPassword("")
      resetTurnstile()
    }
  }

  const transfer = plan?.transfer ?? null
  const roomNumber = plan?.roomNumber || contract.roomNumber
  const tenantName = plan?.tenantName || contract.tenantName

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full md:max-w-lg bg-white dark:bg-slate-800 rounded-t-3xl md:rounded-2xl border-t md:border border-slate-200 dark:border-slate-750 shadow-2xl p-6 space-y-5 relative max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom md:slide-in-from-none md:zoom-in-95 duration-200">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer disabled:opacity-50"
          aria-label="ปิด"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-start gap-4 pr-8">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-full border border-amber-100 dark:border-amber-900/40 shrink-0">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="text-base md:text-lg font-extrabold text-slate-900 dark:text-slate-100">
              ยกเลิกการคืนห้อง/ย้ายออก
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              ห้อง {roomNumber} — {tenantName}
            </p>
          </div>
        </div>

        {step === "loading" && (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 animate-pulse">
            กำลังตรวจสอบข้อมูลห้องและบิลที่เกี่ยวข้อง...
          </div>
        )}

        {step === "blocked" && (
          <>
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 text-xs md:text-sm text-red-700 dark:text-red-300 leading-relaxed flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer active:scale-95"
            >
              ปิด
            </button>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="space-y-2 text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>ระบบจะย้อนการคืนห้องนี้ทั้งหมด:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>คืนข้อมูล <strong>{tenantName}</strong> กลับเข้าห้อง {roomNumber} (LINE และลิงก์ portal ใช้ได้เหมือนเดิม)</li>
                <li>คืนเลขมิเตอร์น้ำ-ไฟของห้อง {roomNumber} เป็นค่าก่อนคืนห้อง</li>
                <li>ประวัติสัญญายกเลิก มาตรา 40(8) รายการนี้จะไม่มีผล และไม่นับใน ภ.ง.ด.</li>
                <li>ห้องจะกลับเป็น <strong>&quot;รอคืนเงินประกัน&quot;</strong> — กรอกมิเตอร์ที่ถูกต้องแล้วคืนเงินใหม่ หรือกดยกเลิกการแจ้งย้ายออกต่อได้</li>
              </ul>
              {transfer && (
                <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 font-bold">
                  ห้องนี้มีผู้เช่าห้องอื่นย้ายเข้ามาอยู่แล้ว — ต้องยืนยันการย้ายกลับในขั้นถัดไป
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer active:scale-95"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => setStep(transfer ? "confirm_transfer" : "password")}
                className="order-1 sm:order-2 w-full sm:flex-1 h-11 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border border-amber-200/60 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                ยืนยันยกเลิกการคืนห้อง
              </button>
            </div>
          </>
        )}

        {step === "confirm_transfer" && transfer && (
          <>
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-3">
              <p className="text-xs md:text-sm font-extrabold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                ยืนยันย้ายผู้เช่ากลับห้องเดิม
              </p>
              <p className="text-sm md:text-base font-bold text-slate-800 dark:text-slate-100">
                {transfer.tenantName}: ห้อง {transfer.toRoomNumber} → กลับไปห้อง {transfer.fromRoomNumber}
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs md:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                <li>ย้อนการย้ายห้องเมื่อวันที่ {transfer.transferDate}</li>
                <li>เลขมิเตอร์ของห้อง {transfer.fromRoomNumber} กลับเป็นค่าก่อนย้าย และค่าน้ำ-ไฟจะคิดในบิลห้อง {transfer.fromRoomNumber} ตามปกติ</li>
                {transfer.depositTopupAmount > 0 && (
                  <li className="font-bold text-red-600 dark:text-red-400">
                    เงินประกันที่เก็บเพิ่มตอนย้าย {transfer.depositTopupAmount.toLocaleString()} บาท จะถูกหักออกจากยอดในระบบ — ต้องคืนเงินส่วนนี้ให้ผู้เช่าเอง
                  </li>
                )}
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer active:scale-95"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => setStep("password")}
                className="order-1 sm:order-2 w-full sm:flex-1 h-11 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 border border-amber-200/60 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold cursor-pointer active:scale-95"
              >
                ยืนยันย้าย {transfer.tenantName} กลับห้อง {transfer.fromRoomNumber}
              </button>
            </div>
          </>
        )}

        {step === "password" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs md:text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> รหัสผ่านบัญชี Admin ของหอนี้
              </span>
              <input
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={submitting}
                className="w-full h-11 px-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:opacity-60"
              />
            </label>
            <Script
              src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
              strategy="afterInteractive"
              onReady={renderTurnstile}
            />
            <div ref={turnstileContainerRef} className="flex justify-center min-h-[65px]" />
            {error && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="order-2 sm:order-1 w-full sm:flex-1 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold cursor-pointer active:scale-95 disabled:opacity-50"
              >
                ไม่ยกเลิก
              </button>
              <button
                type="submit"
                disabled={submitting || !password || !captchaToken}
                className="order-1 sm:order-2 w-full sm:flex-1 h-11 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "กำลังยกเลิกการคืนห้อง..." : "ยืนยันด้วยรหัสผ่าน"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
