"use client"

import { useEffect, useState } from "react"
import { Building2, Zap, Droplet, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react"
import { getBuildingUtilityBillsForWorkspaceCycle, saveBuildingUtilityBill, type BuildingUtilityBill, type UtilityType } from "@/features/billing/building-utility-actions"

interface BuildingUtilityBillPanelProps {
  workspaceId: string
  billingCycle: string
  electricBillingMode: "fixed_rate" | "building_total"
  waterBillingMode: "fixed_rate" | "building_total"
  buildings: { id: string; name: string }[]
  /** เรียกทุกครั้งที่บันทึกยอดสำเร็จ ให้หน้าเรียก (billing/manage-bills) refresh state buildingUtilityBills ของตัวเอง
   *  เพราะ panel นี้เก็บ existingBills แยกต่างหากจากหน้าเรียก — ถ้าไม่มี callback นี้ หน้าเรียกจะยังใช้ค่าเก่า
   *  (พรีวิว/รายการห้องที่ยังไม่ครบ) จนกว่าจะโหลดหน้าใหม่ */
  onSaved?: (row: BuildingUtilityBill) => void
}

/**
 * Panel "ยอดบิลรวมทั้งอาคาร" — แสดงเฉพาะเมื่อ workspace เปิดโหมด building_total ของไฟฟ้าหรือน้ำ
 * เจ้าของหอ/staff กรอกยอดบิลจริง + จำนวนหน่วยรวมทั้งอาคาร ระบบคำนวณอัตรา/หน่วยให้ทันที
 * ต้องกรอกครบก่อนถึงจะออกบิลของอาคารนั้นในรอบนี้ได้ (บังคับฝั่ง server อีกชั้นใน billing/actions.ts)
 */
export default function BuildingUtilityBillPanel({
  workspaceId,
  billingCycle,
  electricBillingMode,
  waterBillingMode,
  buildings,
  onSaved
}: BuildingUtilityBillPanelProps) {
  const [selectedBuildingId, setSelectedBuildingId] = useState("")
  const [existingBills, setExistingBills] = useState<BuildingUtilityBill[]>([])
  const [loading, setLoading] = useState(true)

  const showElectric = electricBillingMode === "building_total"
  const showWater = waterBillingMode === "building_total"
  const effectiveBuildingId = selectedBuildingId || buildings[0]?.id || ""

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!workspaceId || !billingCycle) return
      setLoading(true)
      const res = await getBuildingUtilityBillsForWorkspaceCycle(workspaceId, billingCycle)
      if (cancelled) return
      if (res.success && res.data) {
        setExistingBills(res.data)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [workspaceId, billingCycle])

  if (!showElectric && !showWater) return null

  const handleSaved = (row: BuildingUtilityBill) => {
    setExistingBills(prev => [...prev.filter(b => !(b.buildingId === row.buildingId && b.utilityType === row.utilityType)), row])
    onSaved?.(row)
  }

  return (
    <div className="mb-6 p-5 rounded-2xl border border-amber-300/50 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-4">
      <div className="flex items-center gap-2 text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">
        <Building2 className="w-5 h-5 text-amber-500" />
        ยอดบิลรวมทั้งอาคาร (รอบบิล {billingCycle})
      </div>
      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        กรอกยอดบิลจริง + จำนวนหน่วยรวมทั้งอาคารของรอบนี้ก่อนออกบิลให้ผู้เช่า ระบบจะคำนวณอัตรา/หน่วยให้อัตโนมัติ
      </p>

      {buildings.length > 1 && (
        <div className="max-w-xs">
          <label className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-bold block mb-1">อาคาร</label>
          <select
            value={effectiveBuildingId}
            onChange={(e) => setSelectedBuildingId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold outline-none focus:border-amber-500"
          >
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400 flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังโหลด...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {showElectric && (
            <UtilityInputBlock
              key={`electric-${effectiveBuildingId}`}
              buildingId={effectiveBuildingId}
              billingCycle={billingCycle}
              utilityType="electric"
              label="ไฟฟ้า"
              icon={<Zap className="w-4 h-4 text-amber-400" />}
              accentColor="amber"
              existingRow={existingBills.find(b => b.buildingId === effectiveBuildingId && b.utilityType === "electric") || null}
              onSaved={handleSaved}
            />
          )}
          {showWater && (
            <UtilityInputBlock
              key={`water-${effectiveBuildingId}`}
              buildingId={effectiveBuildingId}
              billingCycle={billingCycle}
              utilityType="water"
              label="น้ำประปา"
              icon={<Droplet className="w-4 h-4 text-blue-400" />}
              accentColor="blue"
              existingRow={existingBills.find(b => b.buildingId === effectiveBuildingId && b.utilityType === "water") || null}
              onSaved={handleSaved}
            />
          )}
        </div>
      )}
    </div>
  )
}

interface UtilityInputBlockProps {
  buildingId: string
  billingCycle: string
  utilityType: UtilityType
  label: string
  icon: React.ReactNode
  accentColor: "amber" | "blue"
  existingRow: BuildingUtilityBill | null
  onSaved: (row: BuildingUtilityBill) => void
}

/**
 * key={`${utilityType}-${buildingId}`} จากผู้เรียก ทำให้ component นี้ remount ใหม่ทุกครั้งที่เปลี่ยนอาคาร
 * จึง init state จาก existingRow ผ่าน useState ได้ตรงๆ โดยไม่ต้องมี effect คอย sync ทับ state ที่ผู้ใช้กำลังพิมพ์
 */
function UtilityInputBlock({ buildingId, billingCycle, utilityType, label, icon, accentColor, existingRow, onSaved }: UtilityInputBlockProps) {
  const [amount, setAmount] = useState(existingRow ? String(existingRow.totalAmount) : "")
  const [units, setUnits] = useState(existingRow ? String(existingRow.totalUnits) : "")
  const [saving, setSaving] = useState(false)

  const ratePreview = Number(amount) > 0 && Number(units) > 0 ? (Number(amount) / Number(units)).toFixed(2) : null
  const focusBorder = accentColor === "amber" ? "focus:border-amber-500" : "focus:border-blue-500"
  const saveButtonColor = accentColor === "amber" ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-500 hover:bg-blue-600"

  const handleSave = async () => {
    if (!buildingId) return
    setSaving(true)
    try {
      const res = await saveBuildingUtilityBill(buildingId, billingCycle, utilityType, Number(amount), Number(units))
      if (res.success && res.data) {
        onSaved(res.data)
      } else {
        alert(res.error || `เกิดข้อผิดพลาดในการบันทึกยอดบิล${label}รวมทั้งอาคาร`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
          {icon} {label}
        </span>
        {existingRow ? (
          <span className="flex items-center gap-1 text-[11px] font-bold text-teal-500"><CheckCircle2 className="w-3.5 h-3.5" /> กรอกแล้ว</span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500"><AlertTriangle className="w-3.5 h-3.5" /> ยังไม่กรอก</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number" min={0} step="0.01" placeholder="ยอดบิลรวม (บาท)"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono outline-none ${focusBorder}`}
        />
        <input
          type="number" min={0} step="0.01" placeholder="หน่วยรวม"
          value={units} onChange={(e) => setUnits(e.target.value)}
          className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm font-mono outline-none ${focusBorder}`}
        />
      </div>
      {ratePreview && (
        <p className="text-xs sm:text-sm text-slate-500">อัตรา: <span className="font-bold text-slate-800 dark:text-slate-200">{ratePreview}</span> บาท/หน่วย</p>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !buildingId || !amount || !units}
        className={`w-full py-2 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer ${saveButtonColor}`}
      >
        {saving ? "กำลังบันทึก..." : `บันทึกยอด${label}`}
      </button>
    </div>
  )
}
