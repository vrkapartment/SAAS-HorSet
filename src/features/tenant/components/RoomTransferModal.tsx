"use client"

import { useEffect, useState } from "react"
import { X, ArrowRightLeft, RefreshCw, AlertTriangle } from "lucide-react"
import { transferTenantRoom } from "@/features/tenant/transfer-actions"
import { getMeterStartForCycle } from "@/features/meter/actions"
import { computeMidMonthRent } from "@/features/room/deposit-calculator"

export interface RoomTransferModalTenant {
  id: string
  /** rooms.id ของห้องปัจจุบัน — ใช้อ่านเลขมิเตอร์ครั้งก่อนหน้า (เลขห้องซ้ำกันได้ข้ามอาคาร) */
  roomId: string
  roomNumber: string
  fullName: string
  depositPaid?: number | null
}

export interface RoomTransferModalVacantRoom {
  id: string
  roomNumber: string
}

interface RoomTransferModalProps {
  tenant: RoomTransferModalTenant
  vacantRooms: RoomTransferModalVacantRoom[]
  /** ใช้จำกัดขอบเขตการอ่านเลขมิเตอร์ครั้งก่อนหน้าให้อยู่ในหอนี้เท่านั้น */
  workspaceId?: string
  /**
   * ค่าเช่าเต็มเดือนของห้องเดิม + นโยบายย้ายออกกลางเดือนของหอ
   * ใช้แค่ "แสดงยอดเริ่มต้น" ให้ผู้ดูแลเห็นในฟอร์ม — ไม่ส่งมาก็ยังย้ายได้
   * ฝั่ง server คำนวณยอดเริ่มต้นเองอยู่แล้วเมื่อไม่ได้ส่ง oldRoomRentAmount มา
   */
  baseRent?: number | null
  checkoutPolicy?: "DAILY_PRORATE" | "FULL_MONTH"
  onClose: () => void
  onSuccess: (result: { toRoomNumber: string }) => void
}

export default function RoomTransferModal({ tenant, vacantRooms, workspaceId, baseRent, checkoutPolicy, onClose, onSuccess }: RoomTransferModalProps) {
  const today = new Date().toISOString().split("T")[0]

  const [toRoomId, setToRoomId] = useState("")
  const [transferDate, setTransferDate] = useState(today)
  const [depositTopupAmount, setDepositTopupAmount] = useState("0")
  const [prevElec, setPrevElec] = useState(0)
  const [prevWater, setPrevWater] = useState(0)
  const [closingElecCurr, setClosingElecCurr] = useState("")
  const [closingWaterCurr, setClosingWaterCurr] = useState("")
  const [startingElecReading, setStartingElecReading] = useState("0")
  const [startingWaterReading, setStartingWaterReading] = useState("0")
  const [note, setNote] = useState("")
  // รวมค่าเช่าห้องเดิมในบิลห้องใหม่หรือไม่ — ค่าเริ่มต้น "ไม่รวม" เพราะบิลห้องใหม่คิดค่าเช่า
  // เต็มเดือนอยู่แล้ว ช่วงเวลาจึงทับกัน ต้องให้ผู้ดูแลตัดสินใจเอง ไม่ใช่ระบบเก็บเพิ่มให้เงียบ ๆ
  const [includeOldRoomRent, setIncludeOldRoomRent] = useState(false)
  const [oldRoomRentAmount, setOldRoomRentAmount] = useState("")

  const [loadingMeter, setLoadingMeter] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadMeter() {
      setLoadingMeter(true)
      try {
        // เลขตั้งต้นของ "รอบที่ย้าย" — ไม่ใช่เลขที่จดล่าสุด
        // ถ้าสตาฟจดมิเตอร์รอบนี้ไปแล้ว เลขล่าสุดคือเลขกลางเดือน เอามาเป็นเลขครั้งก่อน
        // จะทำให้คิดหน่วยแค่ช่วงกลางเดือนถึงวันย้าย (เก็บเงินขาด — เกิดขึ้นจริงมาแล้ว)
        const res = await getMeterStartForCycle({ roomId: tenant.roomId }, transferDate.substring(0, 7), workspaceId)
        if (cancelled) return
        if (res.success && res.data) {
          const pElec = res.data.elecStart
          const pWater = res.data.waterStart
          setPrevElec(pElec)
          setPrevWater(pWater)
          setClosingElecCurr(String(pElec))
          setClosingWaterCurr(String(pWater))
        } else {
          setPrevElec(0)
          setPrevWater(0)
          setClosingElecCurr("0")
          setClosingWaterCurr("0")
        }
      } finally {
        if (!cancelled) setLoadingMeter(false)
      }
    }
    loadMeter()
    return () => { cancelled = true }
  }, [tenant.roomId, workspaceId, transferDate])

  // ยอดค่าเช่าห้องเดิมตามนโยบายของหอ — แสดงเป็น placeholder ให้ผู้ดูแลเห็นว่าถ้าไม่กรอกจะได้เท่าไร
  // ใช้สูตรเดียวกับที่ฝั่ง server ใช้ (computeMidMonthRent) จะได้ไม่มีทางแสดงเลขคนละตัวกับที่คิดจริง
  const defaultOldRoomRent = baseRent !== null && baseRent !== undefined && baseRent > 0
    ? computeMidMonthRent(Number(baseRent), transferDate, checkoutPolicy || "DAILY_PRORATE")
    : null

  const depositBefore = tenant.depositPaid ?? null
  const topupNum = Number(depositTopupAmount || 0)
  const depositAfterPreview = depositBefore !== null ? depositBefore + topupNum : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!toRoomId) {
      setError("กรุณาเลือกห้องปลายทาง")
      return
    }
    if (!transferDate) {
      setError("กรุณาเลือกวันที่ย้าย")
      return
    }
    const closingElecNum = Number(closingElecCurr)
    const closingWaterNum = Number(closingWaterCurr)
    if (closingElecCurr === "" || isNaN(closingElecNum) || closingElecNum < prevElec) {
      setError("เลขมิเตอร์ไฟปิดห้องเดิมต้องไม่น้อยกว่าเลขมิเตอร์ครั้งก่อนหน้า")
      return
    }
    if (closingWaterCurr === "" || isNaN(closingWaterNum) || closingWaterNum < prevWater) {
      setError("เลขมิเตอร์น้ำปิดห้องเดิมต้องไม่น้อยกว่าเลขมิเตอร์ครั้งก่อนหน้า")
      return
    }

    setSubmitting(true)
    try {
      const res = await transferTenantRoom({
        tenantId: tenant.id,
        toRoomId,
        transferDate,
        depositTopupAmount: topupNum,
        closingElecCurr: closingElecNum,
        closingWaterCurr: closingWaterNum,
        startingElecReading: Number(startingElecReading || 0),
        startingWaterReading: Number(startingWaterReading || 0),
        note: note.trim() || undefined,
        includeOldRoomRent,
        // ไม่กรอกตัวเลข = ให้ฝั่ง server ใช้ยอดตามนโยบายของหอ (ไม่ส่ง 0 ไปแทน
        //  ไม่งั้นเลือก "รวม" แล้วเว้นช่องไว้จะกลายเป็นรวม 0 บาทแบบเงียบ ๆ)
        oldRoomRentAmount: includeOldRoomRent && oldRoomRentAmount.trim() !== ""
          ? Number(oldRoomRentAmount)
          : undefined
      })

      if (res.success && res.data) {
        onSuccess({ toRoomNumber: res.data.toRoomNumber })
      } else {
        setError(res.error || "เกิดข้อผิดพลาดในการย้ายห้องผู้เช่า")
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-up">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 rounded-2xl">
              <ArrowRightLeft className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                ย้ายห้องผู้เช่า
              </h3>
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                ห้อง {tenant.roomNumber} • {tenant.fullName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl flex items-start gap-2 text-red-700 dark:text-red-300 text-xs md:text-sm font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Target Room */}
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
              ห้องปลายทาง
            </label>
            <select
              required
              value={toRoomId}
              onChange={(e) => setToRoomId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
            >
              <option value="">-- เลือกห้องว่าง --</option>
              {vacantRooms.map((r) => (
                <option key={r.id} value={r.id}>ห้อง {r.roomNumber}</option>
              ))}
            </select>
            {vacantRooms.length === 0 && (
              <p className="text-xs md:text-sm text-amber-600 dark:text-amber-400 font-semibold">ไม่มีห้องว่างในขณะนี้</p>
            )}
          </div>

          {/* Transfer Date */}
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
              วันที่ย้าย
            </label>
            <input
              type="date"
              required
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
            />
          </div>

          {/* Deposit Top-up */}
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
              เพิ่มเงินประกัน (ถ้ามี)
            </label>
            <input
              type="number"
              step="0.01"
              value={depositTopupAmount}
              onChange={(e) => setDepositTopupAmount(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-mono font-semibold"
              placeholder="0"
            />
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium">
              เงินประกันปัจจุบัน: {depositBefore !== null ? depositBefore.toLocaleString() : "ยังไม่เคยบันทึกยอดจริง (จะคำนวณจากค่าเริ่มต้นของหอ)"} บาท
              {depositAfterPreview !== null && (
                <> → ยอดรวมหลังย้าย: <span className="font-bold text-slate-750 dark:text-slate-200">{depositAfterPreview.toLocaleString()}</span> บาท</>
              )}
            </p>
          </div>

          {/* Closing Meter */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
            <p className="text-xs md:text-sm font-bold text-slate-750 dark:text-slate-300">มิเตอร์ปิดห้องเดิม (ห้อง {tenant.roomNumber})</p>
            {loadingMeter ? (
              <p className="text-xs text-slate-400">กำลังโหลดเลขมิเตอร์ล่าสุด...</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold block">ไฟฟ้า (ครั้งก่อน {prevElec})</label>
                  <input
                    type="number"
                    required
                    value={closingElecCurr}
                    onChange={(e) => setClosingElecCurr(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono font-semibold outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold block">น้ำ (ครั้งก่อน {prevWater})</label>
                  <input
                    type="number"
                    required
                    value={closingWaterCurr}
                    onChange={(e) => setClosingWaterCurr(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono font-semibold outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Starting Meter */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
            <p className="text-xs md:text-sm font-bold text-slate-750 dark:text-slate-300">มิเตอร์เริ่มต้นห้องใหม่</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold block">ไฟฟ้า</label>
                <input
                  type="number"
                  required
                  value={startingElecReading}
                  onChange={(e) => setStartingElecReading(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono font-semibold outline-none focus:border-blue-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold block">น้ำ</label>
                <input
                  type="number"
                  required
                  value={startingWaterReading}
                  onChange={(e) => setStartingWaterReading(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono font-semibold outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* ค่าเช่าห้องเดิม: รวม / ไม่รวม */}
          <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl border border-slate-200/60 dark:border-slate-800/60">
            <p className="text-xs md:text-sm font-bold text-slate-750 dark:text-slate-300">
              ค่าเช่าห้องเดิม (ห้อง {tenant.roomNumber}) ช่วงต้นเดือนถึงวันย้าย
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIncludeOldRoomRent(false)}
                className={`px-3 py-2.5 rounded-lg text-xs md:text-sm font-bold border transition-all ${
                  !includeOldRoomRent
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-500 text-teal-700 dark:text-teal-300"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                ไม่รวม
              </button>
              <button
                type="button"
                onClick={() => setIncludeOldRoomRent(true)}
                className={`px-3 py-2.5 rounded-lg text-xs md:text-sm font-bold border transition-all ${
                  includeOldRoomRent
                    ? "bg-teal-50 dark:bg-teal-900/30 border-teal-500 text-teal-700 dark:text-teal-300"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400"
                }`}
              >
                รวม
              </button>
            </div>

            {includeOldRoomRent && (
              <div className="space-y-1 pt-1">
                <label className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-semibold block">
                  ยอดค่าเช่าห้องเดิมที่จะคิด (บาท) — แก้ได้
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={oldRoomRentAmount}
                  onChange={(e) => setOldRoomRentAmount(e.target.value)}
                  placeholder={defaultOldRoomRent !== null ? String(defaultOldRoomRent) : "เว้นว่างเพื่อใช้ยอดตามนโยบายของหอ"}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono font-semibold outline-none focus:border-blue-500"
                />
                <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  {defaultOldRoomRent !== null ? (
                    <>ยอดตามนโยบายของหอ: <span className="font-bold">{defaultOldRoomRent.toLocaleString()}</span> บาท
                      {" "}({checkoutPolicy === "FULL_MONTH" ? "คิดเต็มเดือน" : `เฉลี่ยรายวัน ${new Date(transferDate).getDate()} วัน`})</>
                  ) : (
                    <>เว้นว่างไว้ ระบบจะคิดตามนโยบายที่ตั้งไว้ใน ตั้งค่า → ข้อมูลหอพัก (การหักเงินประกันกรณีย้ายออกกลางเดือน)</>
                  )}
                </p>
              </div>
            )}

            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              ค่าน้ำ-ค่าไฟของห้องเดิมจะถูกยกไปรวมใน<span className="font-bold">บิลของห้องใหม่</span> รอบ {transferDate.substring(0, 7)} โดยแยกบรรทัดให้เห็นชัดว่าเป็นของห้องเดิม
              — ผู้เช่าจ่ายทีเดียวปลายเดือน ไม่มีบิลแยกใบตอนย้าย
            </p>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-semibold text-slate-750 dark:text-slate-300 block">
              หมายเหตุ (ไม่บังคับ)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 text-sm md:text-base focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all outline-none font-medium resize-none"
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs md:text-sm font-extrabold rounded-xl transition-all cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting || loadingMeter || vacantRooms.length === 0}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs md:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  กำลังย้ายห้อง...
                </>
              ) : (
                "ยืนยันย้ายห้อง"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
