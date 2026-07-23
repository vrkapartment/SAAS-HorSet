"use client"

import React, { useState } from "react"
import { X, ZoomIn, ZoomOut, Eye, UserCheck, XCircle, Loader2, AlertTriangle, Clock, ExternalLink } from "lucide-react"
import { manuallyReviewSaasPaymentAction } from "@/features/subscription/actions"

export interface SaasPaymentRetryQueueStatus {
  status: string
  attempt_count: number
  max_attempts: number
  last_error_code: number | null
  last_error_message: string | null
  next_retry_at: string
}

export interface SaasPaymentForReview {
  id: string
  amount: number
  billing_cycle: string
  status: "pending" | "verified" | "failed"
  slip_image_url: string | null
  archived_drive_url?: string | null
  slipok_response: unknown
  manual_review_note?: string | null
  reviewed_at?: string | null
  created_at: string
  retry_queue_status?: SaasPaymentRetryQueueStatus | null
}

interface SaasPaymentReviewModalProps {
  payment: SaasPaymentForReview
  workspaceName: string
  planName: string
  onClose: () => void
  onReviewed: () => void
}

function extractSlipOkReason(payment: SaasPaymentForReview): { code: number | null; message: string | null } {
  const raw = payment.slipok_response as { error?: string; code?: number; message?: string } | null
  if (raw && typeof raw === "object") {
    return {
      code: typeof raw.code === "number" ? raw.code : null,
      message: raw.error || raw.message || null
    }
  }
  return { code: null, message: null }
}

export default function SaasPaymentReviewModal({
  payment,
  workspaceName,
  planName,
  onClose,
  onReviewed
}: SaasPaymentReviewModalProps) {
  const [isZoomed, setIsZoomed] = useState(false)
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState<"approve" | "reject" | null>(null)
  const [pendingDecision, setPendingDecision] = useState<"approve" | "reject" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultMessage, setResultMessage] = useState<string | null>(null)

  const slipOkReason = extractSlipOkReason(payment)
  const retryStatus = payment.retry_queue_status

  // สลิปเกี่ยวกับเงิน/สิทธิ์การใช้งานของลูกค้าจริง — บังคับให้ยืนยันอีกขั้นก่อนกดจริง ป้องกันการกดพลาด
  const requestDecision = (decision: "approve" | "reject") => {
    setError(null)
    setPendingDecision(decision)
  }

  const confirmPendingDecision = async () => {
    if (!pendingDecision) return
    const decision = pendingDecision
    setPendingDecision(null)
    setSubmitting(decision)
    setError(null)
    try {
      const res = await manuallyReviewSaasPaymentAction(payment.id, decision, note)
      if (!res.success) throw new Error(res.error)
      setResultMessage(res.message || "ดำเนินการเรียบร้อยแล้ว")
      onReviewed()
      setTimeout(onClose, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการตรวจสอบสลิปด้วยตนเอง")
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`ตรวจสอบสลิปจ่ายเงินของ ${workspaceName}`}
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl p-4 md:p-6 relative shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={onClose}
            aria-label="ปิดหน้าต่างตรวจสอบสลิป"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all z-10"
          >
            <X className="w-4 h-4" />
          </button>

          {/* ฝั่งสลิป */}
          <div className="space-y-1.5 flex flex-col">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">หลักฐานการโอนเงิน</h4>
              {payment.slip_image_url && (
                <span className="text-[10px] font-bold text-blue-400 flex items-center gap-1 animate-pulse">
                  <ZoomIn className="w-3 h-3" /> แตะเพื่อขยาย
                </span>
              )}
            </div>
            <div
              onClick={() => payment.slip_image_url && setIsZoomed(true)}
              className="w-full h-56 md:h-[320px] rounded-2xl overflow-hidden border border-slate-800 hover:border-blue-500/50 relative flex items-center justify-center cursor-pointer group bg-slate-950 transition-all"
            >
              {payment.slip_image_url ? (
                <>
                  <img
                    src={payment.slip_image_url}
                    alt="สลิปการโอนเงิน"
                    className="object-contain w-full h-full group-hover:scale-[1.01] transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                    <Eye className="w-4 h-4" /> ดูรูปเต็ม
                  </div>
                </>
              ) : payment.archived_drive_url ? (
                <a
                  href={payment.archived_drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 px-4 text-center"
                >
                  สลิปถูก archive ไป Google Drive แล้ว — เปิดดูที่นี่ <ExternalLink className="w-3.5 h-3.5" />
                </a>
              ) : (
                <p className="text-xs text-slate-600">ไม่มีรูปสลิป</p>
              )}
            </div>
          </div>

          {/* ฝั่งรายละเอียด + เหตุผล + ปุ่มตัดสินใจ */}
          <div className="flex flex-col justify-between pt-1">
            <div className="space-y-3.5">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">หอพัก</span>
                  <span className="font-bold text-slate-200">{workspaceName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">แผน</span>
                  <span className="font-bold text-slate-200">{planName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">รอบบิล</span>
                  <span className="font-mono font-bold text-slate-200">{payment.billing_cycle}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-dashed border-slate-800">
                  <span className="text-slate-500">จำนวนเงิน</span>
                  <span className="font-black text-teal-400">{Number(payment.amount).toLocaleString("th-TH")} บาท</span>
                </div>
              </div>

              {/* เหตุผลที่ยังไม่ผ่าน / ยังรอตรวจสอบ */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-amber-400">
                  <AlertTriangle className="w-4 h-4" />
                  เหตุผลจาก SlipOK
                </div>
                {payment.status === "pending" && retryStatus ? (
                  <div className="text-amber-300/90 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      รอตรวจสอบซ้ำอัตโนมัติ (ครั้งที่ {retryStatus.attempt_count}/{retryStatus.max_attempts}) —
                      รอบถัดไป {new Date(retryStatus.next_retry_at).toLocaleString("th-TH")}
                    </p>
                    <p>
                      Error code: <span className="font-mono">{retryStatus.last_error_code ?? "-"}</span>
                      {retryStatus.last_error_message ? ` — ${retryStatus.last_error_message}` : ""}
                    </p>
                  </div>
                ) : payment.status === "pending" ? (
                  <p className="text-amber-300/90">ยังไม่มีผลตรวจสอบจาก SlipOK กลับมา (อาจอยู่ระหว่างประมวลผล)</p>
                ) : slipOkReason.message ? (
                  <div className="text-amber-300/90 space-y-1">
                    <p>
                      Error code: <span className="font-mono">{slipOkReason.code ?? "-"}</span> — {slipOkReason.message}
                    </p>
                  </div>
                ) : (
                  <p className="text-amber-300/90">ไม่มีข้อมูลเหตุผลเก็บไว้สำหรับรายการนี้</p>
                )}

                {payment.slipok_response != null && (
                  <details className="pt-1">
                    <summary className="cursor-pointer text-[10px] text-amber-400/70 hover:text-amber-300">
                      ดู raw response จาก SlipOK
                    </summary>
                    <pre className="mt-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[10px] text-slate-400 overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(payment.slipok_response, null, 2)}
                    </pre>
                  </details>
                )}
              </div>

              {payment.status !== "pending" && (payment.manual_review_note || payment.reviewed_at) && (
                <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  {payment.reviewed_at && (
                    <p>ตรวจสอบด้วยตนเองเมื่อ: {new Date(payment.reviewed_at).toLocaleString("th-TH")}</p>
                  )}
                  {payment.manual_review_note && <p>หมายเหตุ: {payment.manual_review_note}</p>}
                </div>
              )}

              {payment.status === "pending" && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400">หมายเหตุ (ถ้ามี)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="เช่น ตรวจสอบยอดเงินในสลิปเทียบกับ statement ธนาคารแล้วตรงกัน"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none text-xs resize-none"
                  />
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{error}</div>
              )}
              {resultMessage && (
                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs">{resultMessage}</div>
              )}
            </div>

            {payment.status === "pending" && (
              <div className="space-y-2 pt-4">
                {pendingDecision ? (
                  <div
                    role="alertdialog"
                    aria-label="ยืนยันการตัดสินใจ"
                    className={`p-4 rounded-xl border space-y-3 ${
                      pendingDecision === "approve" ? "bg-teal-500/10 border-teal-500/20" : "bg-rose-500/10 border-rose-500/20"
                    }`}
                  >
                    <p className={`text-xs font-bold leading-relaxed ${pendingDecision === "approve" ? "text-teal-400" : "text-rose-400"}`}>
                      {pendingDecision === "approve"
                        ? `ยืนยันอนุมัติสลิปนี้และเปิดสิทธิ์ใช้งานให้ "${workspaceName}" ทันที ใช่หรือไม่?`
                        : `ยืนยันปฏิเสธสลิปนี้และปิดรายการเป็นล้มเหลว ใช่หรือไม่?`}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingDecision(null)}
                        disabled={submitting !== null}
                        className="flex-1 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold disabled:opacity-60"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={confirmPendingDecision}
                        disabled={submitting !== null}
                        className={`flex-1 h-10 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-60 ${
                          pendingDecision === "approve" ? "bg-teal-600 hover:bg-teal-500" : "bg-rose-600 hover:bg-rose-500"
                        }`}
                      >
                        {submitting !== null ? <Loader2 className="w-4 h-4 animate-spin" /> : "ยืนยัน"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => requestDecision("approve")}
                      disabled={submitting !== null}
                      className="w-full h-11 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-teal-600/10 transition-all"
                    >
                      <UserCheck className="w-4 h-4" />
                      อนุมัติด้วยตนเอง (เปิดสิทธิ์ใช้งาน)
                    </button>
                    <button
                      onClick={() => requestDecision("reject")}
                      disabled={submitting !== null}
                      className="w-full h-11 rounded-xl text-xs font-bold border border-rose-900/40 bg-rose-950/20 hover:bg-rose-600 text-rose-400 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" />
                      ปฏิเสธ (ปิดเป็นล้มเหลว)
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isZoomed && payment.slip_image_url && (
        <div
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer"
        >
          <button
            onClick={() => setIsZoomed(false)}
            className="absolute top-4 right-4 p-2 bg-slate-900/80 text-white hover:bg-slate-800 rounded-full border border-slate-800/80"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <img
            src={payment.slip_image_url}
            alt="สลิปการโอนเงิน (ขยาย)"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
        </div>
      )}
    </>
  )
}
