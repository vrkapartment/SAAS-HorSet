import React, { useState, useMemo } from "react"
import { useLanguage } from "@/lib/translations/LanguageProvider"
import { DynamicText } from "@/lib/translations/DynamicText"
import { Save, Eye, Download, Send, CheckCircle, RefreshCw, Zap, Droplet, Sparkles, FileText, X, Copy, Check, AlertCircle, AlertTriangle, MessageSquare, Edit3, Lock, Wrench, Link } from "lucide-react"
import { StaffPermissions, DEFAULT_STAFF_PERMISSIONS } from "@/features/permissions/types"
import { generateSecurePortalLinkAction } from "@/features/tenant/actions"
import { saveMeterReplacement, deleteMeterReplacement } from "@/features/meter/actions"
import { useIsDesktop } from "@/hooks/useIsDesktop"

interface MeterReadingTableProps {
  isDark: boolean
  loading: boolean
  unifiedItems: any[]
  commonFee: number
  electricMinChecked: boolean
  electricMinUnit: number
  elecRate: number
  waterMinChecked: boolean
  waterMinUnit: number
  waterRate: number
  currentUserRole: string | null
  downloadingPdfId: string | null
  handleElecPrevChange: (roomNumber: string, value: string) => void
  handleElecChange: (roomNumber: string, value: string) => void
  handleWaterPrevChange: (roomNumber: string, value: string) => void
  handleWaterChange: (roomNumber: string, value: string) => void
  handleSaveRow: (roomNumber: string, type?: "electric" | "water" | "all") => Promise<void>
  // รูปแบบการจดที่เลือกจากแถบหัวของหน้า /billing — ใช้เฉพาะ mode "meters"
  // (optional เพราะ /manage-bills ใช้ component ตัวเดียวกันด้วย mode "billing" และไม่ส่งค่านี้)
  meterEntryUtility?: "electric" | "water" | "both"
  // ชื่อชั้นที่กำลังกรองอยู่ (undefined = ทุกชั้น) ใช้แสดงใน label ปุ่มบันทึกทั้งหมดเท่านั้น
  activeFloorLabel?: string
  // จำนวนห้องทั้งหอที่กรอกค้างไว้แต่ยังไม่บันทึก (นับจากทุกอาคาร/ทุกชั้น ไม่ใช่แค่ที่มองเห็น)
  totalUnsavedCount?: number
  setSelectedBill: (item: any) => void
  setSlipModalOpen: (open: boolean) => void
  handleDownloadBillPdf: (item: any) => Promise<void>
  handleSendLine: (roomNumber: string) => void | Promise<void>
  handleMarkAsPaid: (billId: string, roomNumber: string) => Promise<void>
  // roomNumbers = ขอบเขตที่มองเห็นจริง ต้องส่งไปด้วยเสมอ ไม่เช่นนั้น page จะบันทึกทับห้องนอกขอบเขต
  handleSaveAll?: (type: "electric" | "water" | "both", roomNumbers?: string[]) => Promise<void>
  // New props for bulk LINE OA feature
  roomsList: any[]
  usageAverages?: Record<string, { avgElec: number; avgWater: number; sampleCount: number }>
  billingCycle: string
  workspaceName: string
  currentWorkspaceId: string
  userPermissions?: StaffPermissions
  hasEditPermission?: boolean
  handleLateDaysChange?: (roomNumber: string, value: string) => void
  handleSaveLateDays?: (roomNumber: string) => Promise<void>
  latePenaltyRate?: number
  handleOtherServiceChange?: (roomNumber: string, value: string) => void
  mode?: "meters" | "billing"
  meterReplacements?: any[]
  onMeterReplacementsChange?: () => void | Promise<void>
  savingRows?: {[roomNumber: string]: boolean}
  handleDownloadAllBillsPdf?: () => Promise<void>
  downloadingAllPdf?: boolean
}

export default function MeterReadingTable({
  isDark,
  loading,
  unifiedItems,
  commonFee,
  electricMinChecked,
  electricMinUnit,
  elecRate,
  waterMinChecked,
  waterMinUnit,
  waterRate,
  currentUserRole,
  downloadingPdfId,
  handleElecPrevChange,
  handleElecChange,
  handleWaterPrevChange,
  handleWaterChange,
  handleSaveRow,
  setSelectedBill,
  setSlipModalOpen,
  handleDownloadBillPdf,
  handleSendLine,
  handleMarkAsPaid,
  handleSaveAll,
  roomsList,
  usageAverages = {},
  billingCycle,
  workspaceName,
  currentWorkspaceId,
  userPermissions,
  hasEditPermission,
  handleLateDaysChange,
  handleSaveLateDays,
  latePenaltyRate = 0,
  handleOtherServiceChange,
  mode = "billing",
  meterEntryUtility,
  activeFloorLabel,
  totalUnsavedCount = 0,
  meterReplacements = [],
  onMeterReplacementsChange,
  savingRows = {},
  handleDownloadAllBillsPdf,
  downloadingAllPdf = false
}: MeterReadingTableProps) {
  const permissions = userPermissions || DEFAULT_STAFF_PERMISSIONS
  const hasEdit = hasEditPermission !== undefined ? hasEditPermission : permissions.manage_meters_bills_edit
  const { t, locale } = useLanguage()
  // "all" = ชุดคอลัมน์ของหน้าจัดการใบแจ้งหนี้ (/manage-bills, mode "billing") — มิเตอร์อ่านอย่างเดียว
  // "electric"/"water" = จดทีละสาธารณูปโภค | "both" = จดไฟและน้ำพร้อมกันในแถวเดียว
  //
  // ไม่ใช่ state ของ component นี้แล้ว เพราะตัวเลือกย้ายไปอยู่แถบหัวของหน้า /billing (จำค่าไว้ต่อ workspace)
  // การรับมาเป็น prop ทำให้ค่าที่ผู้ใช้พิมพ์ค้างไว้ไม่หายตอนสลับโหมด — ค่าอยู่ใน unifiedItems ของ page
  const activeTab: "all" | "electric" | "water" | "both" =
    mode === "billing" ? "all" : (meterEntryUtility ?? "electric")

  const showElectricColumns = activeTab === "electric" || activeTab === "both"
  const showWaterColumns = activeTab === "water" || activeTab === "both"
  // ห้อง + สถานะ + (ไฟ 3 | น้ำ 3 | ทั้งคู่ 6) + ปุ่มบันทึก 1
  const colSpanVal = activeTab === "all" ? 9 : activeTab === "both" ? 9 : 6

  const [bulkSendModalOpen, setBulkSendModalOpen] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState<"connected" | "unconnected">("connected")
  const [bulkSendingStatus, setBulkSendingStatus] = useState<"idle" | "sending" | "completed">("idle")
  const [bulkSendingProgress, setBulkSendingProgress] = useState({ current: 0, total: 0, currentRoom: "" })
  const [bulkSendResults, setBulkSendResults] = useState<{ [room: string]: { success: boolean; error?: string } }>({})
  const [copiedRooms, setCopiedRooms] = useState<{ [room: string]: boolean }>({})
  const [copiedLinks, setCopiedLinks] = useState<{ [room: string]: boolean }>({})
  const [unlockedPaidRooms, setUnlockedPaidRooms] = useState<Record<string, boolean>>({})

  // ดัชนีสำหรับ lookup แบบ O(1) — เดิมทุกแถวเรียก .find() ไล่ทั้ง array ซ้ำหลายรอบต่อการ render 1 ครั้ง
  // (roomsList 1 ครั้งในแถว + อีก 1 ครั้งใน getUsageAnomaly + meterReplacements ใน getUnitsUsedWithRollover
  //  และ isMeterRollover) แล้วยัง render ซ้ำทั้ง mobile list และ desktop table พร้อมกัน
  // ต้นทุนรวมจึงเป็น O(N²) ต่อการกดแป้น 1 ครั้ง เพราะ setUnifiedItems สร้าง array ใหม่ทุกตัวอักษรที่พิมพ์
  const roomInfoByNumber = useMemo(
    () => new Map<string, any>((roomsList || []).map((r: any) => [r.roomNumber, r])),
    [roomsList]
  )
  const replacementByRoomType = useMemo(
    () => new Map<string, any>((meterReplacements || []).map((r: any) => [`${r.roomNumber}:${r.meterType}`, r])),
    [meterReplacements]
  )
  const itemByRoomNumber = useMemo(
    () => new Map<string, any>((unifiedItems || []).map((i: any) => [i.roomNumber, i])),
    [unifiedItems]
  )

  // เดิม render ทั้ง mobile card list และ desktop table พร้อมกันเสมอ แล้วให้ CSS ซ่อนฝั่งที่ไม่ใช้
  // (block md:hidden / hidden md:block) แปลว่ามี 2N แถวใน tree ตลอด และทุกตัวอักษรที่พิมพ์ต้อง
  // สร้าง JSX + reconcile ทั้ง 2N แถว ทั้งที่ผู้ใช้เห็นแค่ N แถว
  //
  // isDesktop เป็น null ตอน SSR/hydration → ช่วงนั้นยัง render ทั้งสองฝั่งเหมือนเดิม (CSS ซ่อนให้)
  // พอรู้ขนาดจริงจึงตัดฝั่งที่ไม่ได้แสดงออกจาก tree — คงคลาส CSS เดิมไว้เป็นตัวกันชนด้วย
  // เผื่อ media query ให้ค่าไม่ตรง จะได้ไม่มีทางแสดงผลผิดฝั่ง
  const isDesktop = useIsDesktop()
  const showMobileList = isDesktop !== true
  const showDesktopTable = isDesktop !== false

  // --- มิเตอร์หมุนเวียนครบรอบ (Meter Rollover) & เปลี่ยนมิเตอร์ (Meter Replacement) Helpers ---
  const [replacementModal, setReplacementModal] = useState<{
    isOpen: boolean;
    roomNumber: string;
    meterType: "electric" | "water";
    oldFinalReading: string;
    newStartReading: string;
    isEdit: boolean;
    loading: boolean;
  } | null>(null);

  const getReplacement = (roomNumber: string, type: "electric" | "water") => {
    return replacementByRoomType.get(`${roomNumber}:${type}`);
  };

  const getUnitsUsedWithRollover = (
    curr: string | number | null | undefined,
    prev: string | number | null | undefined,
    roomNumber?: string,
    meterType?: "electric" | "water"
  ): number => {
    if (curr === "" || curr === null || curr === undefined) return 0;
    const currNum = Number(curr);
    const prevNum = Number(prev || 0);
    if (isNaN(currNum) || isNaN(prevNum)) return 0;

    const getUnits = (c: number, p: number) => {
      if (c >= p) return c - p;
      return (10000 - p) + c;
    };

    const replacement = roomNumber && meterType ? getReplacement(roomNumber, meterType) : undefined;

    if (replacement) {
      const oldFinal = Number(replacement.oldFinalReading ?? 0);
      const newStart = Number(replacement.newStartReading ?? 0);
      const oldUnits = getUnits(oldFinal, prevNum);
      const newUnits = getUnits(currNum, newStart);
      return oldUnits + newUnits;
    }

    if (currNum >= prevNum) return currNum - prevNum;
    return (10000 - prevNum) + currNum;
  };

  const isMeterRollover = (
    curr: string | number | null | undefined,
    prev: string | number | null | undefined,
    roomNumber?: string,
    meterType?: "electric" | "water"
  ): boolean => {
    if (curr === "" || curr === null || curr === undefined) return false;
    const currNum = Number(curr);
    const prevNum = Number(prev || 0);
    if (isNaN(currNum) || isNaN(prevNum)) return false;

    const replacement = roomNumber && meterType ? getReplacement(roomNumber, meterType) : undefined;

    if (replacement) {
      const oldFinal = Number(replacement.oldFinalReading ?? 0);
      const newStart = Number(replacement.newStartReading ?? 0);
      const oldRollover = oldFinal < prevNum;
      const newRollover = currNum < newStart;
      return oldRollover || newRollover;
    }

    return currNum < prevNum;
  };

  const handleOpenReplacementModal = (roomNumber: string, meterType: "electric" | "water", existing?: any) => {
    const item = itemByRoomNumber.get(roomNumber);
    if (!item) return;

    if (!permissions.manage_meters_bills) {
      alert(locale === "en" ? "You do not have permission to manage meter data. Please contact Admin." : "คุณไม่มีสิทธิ์ในการจัดการข้อมูลมิเตอร์ กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }

    if (item.billStatus === "paid" && !unlockedPaidRooms[roomNumber]) {
      alert(locale === "en" ? "Cannot record or replace meter because the bill for this room has been paid and not unlocked for editing." : "ไม่สามารถบันทึกหรือเปลี่ยนมิเตอร์ได้ เนื่องจากบิลของห้องนี้ได้รับการชำระเงินเรียบร้อยแล้วและยังไม่ได้ปลดล็อกแก้ไข");
      return;
    }

    setReplacementModal({
      isOpen: true,
      roomNumber,
      meterType,
      oldFinalReading: existing ? String(existing.oldFinalReading) : "",
      newStartReading: existing ? String(existing.newStartReading) : "",
      isEdit: !!existing,
      loading: false
    });
  };

  const handleSaveReplacement = async () => {
    if (!replacementModal) return;
    const { roomNumber, meterType, oldFinalReading, newStartReading } = replacementModal;

    const oldNum = Number(oldFinalReading);
    const newNum = Number(newStartReading);

    if (oldFinalReading === "" || isNaN(oldNum)) {
      alert(locale === "en" ? "Please fill in the old meter's final reading correctly." : "กรุณากรอกเลขมิเตอร์เครื่องเดิมครั้งสุดท้ายให้ถูกต้อง");
      return;
    }
    if (newStartReading === "" || isNaN(newNum)) {
      alert(locale === "en" ? "Please fill in the new meter's starting reading correctly." : "กรุณากรอกเลขมิเตอร์เครื่องใหม่เริ่มต้นให้ถูกต้อง");
      return;
    }

    setReplacementModal(prev => prev ? { ...prev, loading: true } : null);

    try {
      const res = await saveMeterReplacement(
        currentWorkspaceId,
        roomNumber,
        billingCycle,
        meterType,
        oldNum,
        newNum
      );

      if (res.success) {
        if (onMeterReplacementsChange) {
          await onMeterReplacementsChange();
        }
        setReplacementModal(null);
      } else {
        alert(res.error || (locale === "en" ? "An error occurred while saving data." : "เกิดข้อผิดพลาดในการบันทึกข้อมูล"));
        setReplacementModal(prev => prev ? { ...prev, loading: false } : null);
      }
    } catch (e: any) {
      alert(e?.message || (locale === "en" ? "System error occurred." : "เกิดข้อผิดพลาดระบบ"));
      setReplacementModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const handleDeleteReplacement = async () => {
    if (!replacementModal) return;
    const { roomNumber, meterType } = replacementModal;

    if (!confirm(locale === "en" ? "Are you sure you want to delete this mid-month meter replacement record? The system will revert to normal calculation." : "คุณต้องการลบข้อมูลการเปลี่ยนมิเตอร์กลางเดือนนี้ใช่หรือไม่? ระบบจะกลับไปคิดแบบปกติ")) {
      return;
    }

    setReplacementModal(prev => prev ? { ...prev, loading: true } : null);

    try {
      const res = await deleteMeterReplacement(roomNumber, billingCycle, meterType);
      if (res.success) {
        if (onMeterReplacementsChange) {
          await onMeterReplacementsChange();
        }
        setReplacementModal(null);
      } else {
        alert(res.error || (locale === "en" ? "An error occurred while deleting data." : "เกิดข้อผิดพลาดในการลบข้อมูล"));
        setReplacementModal(prev => prev ? { ...prev, loading: false } : null);
      }
    } catch (e: any) {
      alert(e?.message || "เกิดข้อผิดพลาดระบบ");
      setReplacementModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const [rolloverConfirm, setRolloverConfirm] = useState<{
    isOpen: boolean
    roomNumber: string
    type: "electric" | "water" | "all"
    isBulk: boolean
    onConfirm: () => void
  } | null>(null)

  const [usageAnomalyConfirm, setUsageAnomalyConfirm] = useState<{
    isOpen: boolean
    isBulk: boolean
    rooms: {
      roomNumber: string
      elecAbnormal: boolean
      waterAbnormal: boolean
      elecUnits: number
      elecAvg: number
      waterUnits: number
      waterAvg: number
    }[]
    onConfirm: () => void
  } | null>(null)

  // เทียบหน่วยที่คำนวณได้ของห้องนี้กับค่าเฉลี่ย 3 เดือนล่าสุด เพื่อจับเลขมิเตอร์ที่จดผิดปกติ
  // ข้ามการเช็คถ้าห้องว่าง หรือผู้เช่าย้ายเข้ามาไม่ถึง 3 เดือน (ยังไม่มีค่าเฉลี่ยที่น่าเชื่อถือ)
  const getUsageAnomaly = (item: any, type: "electric" | "water" | "all") => {
    const result = { hasAnomaly: false, elecAbnormal: false, waterAbnormal: false, elecUnits: 0, elecAvg: 0, waterUnits: 0, waterAvg: 0 }
    if (!item.tenantName) return result

    const roomInfo = roomInfoByNumber.get(item.roomNumber)
    const leaseStart = roomInfo?.leaseStart
    if (leaseStart && billingCycle) {
      const leaseDate = new Date(leaseStart)
      const cycleDate = new Date(`${billingCycle}-01`)
      const monthsSinceLease = (cycleDate.getFullYear() - leaseDate.getFullYear()) * 12 + (cycleDate.getMonth() - leaseDate.getMonth())
      if (monthsSinceLease < 3) return result
    }

    const avgData = usageAverages?.[item.roomNumber]
    if (!avgData || avgData.sampleCount === 0) return result

    if (type !== "water" && item.elecCurr !== "") {
      const elecUnits = getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric")
      if (avgData.avgElec > 0 && elecUnits <= 3000 && Math.abs(elecUnits - avgData.avgElec) / avgData.avgElec > 1) {
        result.elecAbnormal = true
        result.elecUnits = elecUnits
        result.elecAvg = avgData.avgElec
        result.hasAnomaly = true
      }
    }

    if (type !== "electric" && item.waterCurr !== "") {
      const waterUnits = getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water")
      if (avgData.avgWater > 0 && waterUnits <= 3000 && Math.abs(waterUnits - avgData.avgWater) / avgData.avgWater > 1) {
        result.waterAbnormal = true
        result.waterUnits = waterUnits
        result.waterAvg = avgData.avgWater
        result.hasAnomaly = true
      }
    }

    return result
  }

  const onSaveRowWithRolloverCheck = async (roomNumber: string, type: "electric" | "water" | "all" = "all") => {
    const item = itemByRoomNumber.get(roomNumber)
    if (!item) return

    const doSave = async () => {
      await handleSaveRow(roomNumber, type)
      if (item.billStatus === "paid") {
        setUnlockedPaidRooms(prev => ({ ...prev, [roomNumber]: false }))
      }
    }

    const checkAnomalyThenSave = () => {
      const anomaly = getUsageAnomaly(item, type)
      if (anomaly.hasAnomaly) {
        setUsageAnomalyConfirm({
          isOpen: true,
          isBulk: false,
          rooms: [{
            roomNumber,
            elecAbnormal: anomaly.elecAbnormal,
            waterAbnormal: anomaly.waterAbnormal,
            elecUnits: anomaly.elecUnits,
            elecAvg: anomaly.elecAvg,
            waterUnits: anomaly.waterUnits,
            waterAvg: anomaly.waterAvg
          }],
          onConfirm: doSave
        })
      } else {
        doSave()
      }
    }

    const hasElecRolloverVal = type !== "water" && isMeterRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric")
    const hasWaterRolloverVal = type !== "electric" && isMeterRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water")

    if (hasElecRolloverVal || hasWaterRolloverVal) {
      setRolloverConfirm({
        isOpen: true,
        roomNumber,
        type,
        isBulk: false,
        onConfirm: checkAnomalyThenSave
      })
    } else {
      checkAnomalyThenSave()
    }
  }

  const onSaveAllWithRolloverCheck = async (type: "electric" | "water" | "both") => {
    if (!handleSaveAll) return;
    const needsElec = type === "electric" || type === "both"
    const needsWater = type === "water" || type === "both"

    const itemsToSave = unifiedItems.filter(item => {
      if (item.isMeterSaved) return false
      // โหมด "ไฟ+น้ำ" ต้องกรอกครบทั้งสองค่าจึงจะเข้าข่ายบันทึก (page จะข้ามห้องที่ไม่ครบและรายงานให้)
      if (needsElec && item.elecCurr === "") return false
      if (needsWater && item.waterCurr === "") return false
      return true
    });

    const anyRollover = itemsToSave.some(item =>
      (needsElec && isMeterRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric")) ||
      (needsWater && isMeterRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water"))
    );

    const doSaveAll = async () => {
      // ส่งเฉพาะเลขห้องที่แสดงอยู่จริง (ผ่านตัวกรองอาคาร/ชั้นมาแล้ว) เพื่อไม่ให้ upsert ไปทับ
      // ห้องนอกขอบเขตที่ผู้ใช้ไม่ได้กำลังจดอยู่ — ดูคอมเมนต์ที่ handleSaveAll ใน billing/page.tsx
      await handleSaveAll(type, unifiedItems.map(i => i.roomNumber))
      setUnlockedPaidRooms({})
    }

    const checkAnomalyThenSaveAll = () => {
      // getUsageAnomaly รับ "all" เพื่อหมายถึงตรวจทั้งไฟและน้ำ ซึ่งตรงกับโหมด "both"
      const anomalyScope = type === "both" ? "all" : type
      const anomalousRooms = itemsToSave
        .map(item => ({ roomNumber: item.roomNumber, anomaly: getUsageAnomaly(item, anomalyScope) }))
        .filter(r => r.anomaly.hasAnomaly)
      if (anomalousRooms.length > 0) {
        setUsageAnomalyConfirm({
          isOpen: true,
          isBulk: true,
          rooms: anomalousRooms.map(r => ({
            roomNumber: r.roomNumber,
            elecAbnormal: r.anomaly.elecAbnormal,
            waterAbnormal: r.anomaly.waterAbnormal,
            elecUnits: r.anomaly.elecUnits,
            elecAvg: r.anomaly.elecAvg,
            waterUnits: r.anomaly.waterUnits,
            waterAvg: r.anomaly.waterAvg
          })),
          onConfirm: doSaveAll
        })
      } else {
        doSaveAll()
      }
    }

    if (anyRollover) {
      setRolloverConfirm({
        isOpen: true,
        roomNumber: locale === "en" ? "All selected rooms" : "ทุกห้องที่เลือก",
        // โมดอลยืนยันมิเตอร์หมุนครบรอบใช้ "all" หมายถึงทั้งไฟและน้ำ ซึ่งตรงกับโหมด "both"
        type: type === "both" ? "all" : type,
        isBulk: true,
        onConfirm: checkAnomalyThenSaveAll
      })
    } else {
      checkAnomalyThenSaveAll()
    }
  }


  // กรองห้องที่{t("billing.occupied")}และออกบิลประจำรอบนั้นแล้ว (ไม่รวมห้อง{t("billing.vacant")} หรือยังไม่ออกบิล)
  // ใช้เฉพาะในโมดอลส่ง LINE OA แบบกลุ่ม แต่เดิมคำนวณใหม่ทุกครั้งที่ render (คือทุกตัวอักษรที่พิมพ์)
  const activeRooms = useMemo(
    () => unifiedItems.filter(item => item.tenantName && item.billStatus !== "not_created"),
    [unifiedItems]
  )

  const connectedRooms = useMemo(
    () => activeRooms.filter(item => !!roomInfoByNumber.get(item.roomNumber)?.lineUserId),
    [activeRooms, roomInfoByNumber]
  )

  const unconnectedRooms = useMemo(
    () => activeRooms.filter(item => !roomInfoByNumber.get(item.roomNumber)?.lineUserId),
    [activeRooms, roomInfoByNumber]
  )

  // ฟังก์ชันจัดรูปแบบรอบบิลสำหรับใช้ในหน้านี้ (Bilingual)
  function formatBillingCycleLocal(cycleStr: string, currentLocale: string): string {
    if (!cycleStr) return ""
    if (cycleStr.includes("-")) {
      const [year, month] = cycleStr.split("-")
      const monthIdx = parseInt(month, 10) - 1
      if (monthIdx >= 0 && monthIdx < 12) {
        if (currentLocale === "en") {
          const monthsEng = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
          ]
          return `${monthsEng[monthIdx]} ${year}`
        } else {
          const monthsThai = [
            "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
            "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
          ]
          return `${monthsThai[monthIdx]} ${year}`
        }
      }
    }
    return cycleStr
  }

  // ฟังก์ชันสำหรับคัดลอกข้อมูลใบแจ้งหนี้แบบสรุป เพื่ออำนวยความสะดวกในห้องที่ไม่ได้ผูก LINE UID
  const handleCopySummary = async (item: any) => {
    if (!permissions.billing_copy_summary) {
      alert(locale === "en" ? "You do not have permission to copy summary. Please contact Admin." : "คุณไม่มีสิทธิ์ในการคัดลอกสรุปบิล กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    const elecUnitsUsed = item.elecCurr !== "" ? getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric") : 0
    const waterUnitsUsed = item.waterCurr !== "" ? getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water") : 0

    const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
    const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

    let portalLink = ""
    if (currentWorkspaceId) {
      const res = await generateSecurePortalLinkAction(currentWorkspaceId, item.roomNumber)
      if (res.success && res.link) {
        portalLink = res.link
      } else {
        const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
        portalLink = `${safeAppUrl}/portal?workspace_id=${currentWorkspaceId}&room_number=${encodeURIComponent(item.roomNumber)}`
      }
    } else {
      const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
      portalLink = `${safeAppUrl}/portal`
    }

    const roomInfo = roomInfoByNumber.get(item.roomNumber)
    const extraExpenses = roomInfo?.extraExpenses || []
    const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

    const cycleText = formatBillingCycleLocal(billingCycle, locale)
    const otherServiceAmt = Number(item.otherServiceAmount || 0)
    const penaltyAmt = Number(item.penaltyAmount || 0)
    const totalAmount = item.billAmount || (item.baseRent + elecCost + waterCost + commonFee + otherServiceAmt + penaltyAmt + extraExpensesSum)

    const extraExpensesText = extraExpenses && extraExpenses.length > 0
      ? extraExpenses.map((exp: any) => {
          const name = exp.name || (locale === "en" ? "Extra Expense" : "ค่าใช้จ่ายเสริม")
          const unit = locale === "en" ? "THB" : "บาท"
          return `\n• ${name}: ${Number(exp.amount || 0).toLocaleString()} ${unit}`
        }).join("")
      : ""

    const text = locale === "en"
      ? `🏠 ${workspaceName || "Dormitory"} - Monthly Billing Summary ${cycleText}
Room No.: ${item.roomNumber}
Tenant: ${item.tenantName || "Tenant"}
----------------------------------
• Room Rent: ${item.baseRent.toLocaleString()} THB
• Electricity: ${elecCost.toLocaleString()} THB (used ${elecUnitsUsed} units)
• Water: ${waterCost.toLocaleString()} THB (used ${waterUnitsUsed} units)
• Common Fee: ${commonFee.toLocaleString()} THB${otherServiceAmt > 0 ? `\n• Other Services: ${otherServiceAmt.toLocaleString()} THB` : ""}${penaltyAmt > 0 ? `\n• Late Penalty: ${penaltyAmt.toLocaleString()} THB` : ""}${extraExpensesText}
----------------------------------
💰 Total Net Payment: ${totalAmount.toLocaleString()} THB

You can view your bill online and upload the transfer slip here:
🔗 ${portalLink}

Thank you 🙏`
      : `🏠 ${workspaceName || "หอพัก"} - ใบแจ้งค่าใช้จ่ายประจำเดือน ${cycleText}
เลขห้อง: ${item.roomNumber}
ผู้เช่า: ${item.tenantName || "ผู้เช่า"}
----------------------------------
• ค่าเช่าห้อง: ${item.baseRent.toLocaleString()} บาท
• ค่าไฟฟ้า: ${elecCost.toLocaleString()} บาท (ใช้ไป ${elecUnitsUsed} หน่วย)
• ค่าน้ำประปา: ${waterCost.toLocaleString()} บาท (ใช้ไป ${waterUnitsUsed} หน่วย)
• ค่าส่วนกลาง: ${commonFee.toLocaleString()} บาท${otherServiceAmt > 0 ? `\n• ค่าบริการอื่น ๆ: ${otherServiceAmt.toLocaleString()} บาท` : ""}${penaltyAmt > 0 ? `\n• ค่าปรับจ่ายล่าช้า: ${penaltyAmt.toLocaleString()} บาท` : ""}${extraExpensesText}
----------------------------------
💰 ยอดสุทธิที่ต้องชำระ: ${totalAmount.toLocaleString()} บาท

คุณสามารถดูบิลออนไลน์และแจ้งชำระเงินได้ที่ลิงก์นี้:
🔗 ${portalLink}

ขอบคุณค่ะ/ครับ 🙏`

    let copied = false
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        copied = true
      } catch (err) {
        console.warn("Navigator clipboard failed, trying fallback:", err)
      }
    }

    if (!copied) {
      try {
        const textArea = document.createElement("textarea")
        textArea.value = text
        textArea.style.position = "fixed"
        textArea.style.top = "0"
        textArea.style.left = "0"
        textArea.style.opacity = "0"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        copied = document.execCommand("copy")
        document.body.removeChild(textArea)
      } catch (err) {
        console.error("Fallback clipboard copy failed:", err)
      }
    }

    if (copied) {
      setCopiedRooms(prev => ({ ...prev, [item.roomNumber]: true }))
      setTimeout(() => {
        setCopiedRooms(prev => ({ ...prev, [item.roomNumber]: false }))
      }, 3500)
    } else {
      alert(locale === "en" ? "Your device or browser does not support automatic copying. Please copy the text manually." : "เครื่องหรือเบราว์เซอร์ของคุณไม่รองรับการคัดลอกอัตโนมัติ กรุณาคัดลอกข้อความด้วยตนเอง");
    }
  }

  // ฟังก์ชันสำหรับคัดลอกเฉพาะลิงก์ portal
  const handleCopyPortalLink = async (item: any) => {
    if (!permissions.billing_copy_summary) {
      alert(locale === "en" ? "You do not have permission to copy the portal link. Please contact Admin to request access." : "คุณไม่มีสิทธิ์ในการคัดลอกลิงก์ portal กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }

    let portalLink = ""
    if (currentWorkspaceId) {
      const res = await generateSecurePortalLinkAction(currentWorkspaceId, item.roomNumber)
      if (res.success && res.link) {
        portalLink = res.link
      } else {
        const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
        portalLink = `${safeAppUrl}/portal?workspace_id=${currentWorkspaceId}&room_number=${encodeURIComponent(item.roomNumber)}`
      }
    } else {
      const safeAppUrl = typeof window !== "undefined" ? window.location.origin : ""
      portalLink = `${safeAppUrl}/portal`
    }

    let copied = false
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(portalLink)
        copied = true
      } catch (err) {
        console.warn("Navigator clipboard failed, trying fallback:", err)
      }
    }

    if (!copied) {
      try {
        const textArea = document.createElement("textarea")
        textArea.value = portalLink
        textArea.style.position = "fixed"
        textArea.style.top = "0"
        textArea.style.left = "0"
        textArea.style.opacity = "0"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        copied = document.execCommand("copy")
        document.body.removeChild(textArea)
      } catch (err) {
        console.error("Fallback clipboard copy failed:", err)
      }
    }

    if (copied) {
      setCopiedLinks(prev => ({ ...prev, [item.roomNumber]: true }))
      setTimeout(() => {
        setCopiedLinks(prev => ({ ...prev, [item.roomNumber]: false }))
      }, 3500)
    } else {
      alert(locale === "en" ? "Your device or browser does not support automatic copying. Please copy the text manually." : "เครื่องหรือเบราว์เซอร์ของคุณไม่รองรับการคัดลอกอัตโนมัติ กรุณาคัดลอกข้อความด้วยตนเอง");
    }
  }

  // ฟังก์ชันเริ่มส่ง LINE OA แบบกลุ่มทีละห้อง
  const startBulkSend = async () => {
    if (!permissions.billing_send_line) {
      alert(locale === "en" ? "You do not have permission to send LINE OA. Please contact Admin to request access." : "คุณไม่มีสิทธิ์ในการส่งยอด LINE OA กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อขอสิทธิ์การใช้งาน")
      return
    }
    if (connectedRooms.length === 0) return
    
    setBulkSendingStatus("sending")
    setBulkSendingProgress({ current: 0, total: connectedRooms.length, currentRoom: "" })
    const results: { [room: string]: { success: boolean; error?: string } } = {}

    try {
      const { sendLineBillNotificationAction } = await import("@/features/notification/actions")

      for (let i = 0; i < connectedRooms.length; i++) {
        const item = connectedRooms[i]
        setBulkSendingProgress({ current: i + 1, total: connectedRooms.length, currentRoom: item.roomNumber })
        
        if (item.billStatus === "paid") {
          results[item.roomNumber] = { success: false, error: locale === "en" ? "Paid" : "ชำระเงินแล้ว" }
          continue
        }

        const roomInfo = roomInfoByNumber.get(item.roomNumber)
        const lineUserId = roomInfo?.lineUserId

        if (!lineUserId) {
          results[item.roomNumber] = { success: false, error: locale === "en" ? "LINE User ID not found" : "ไม่พบข้อมูลรหัส LINE User ID" }
          continue
        }

        const extraExpenses = roomInfo?.extraExpenses || []
        const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

        try {
          const elecUnitsUsed = item.elecCurr !== "" ? getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric") : 0
          const waterUnitsUsed = item.waterCurr !== "" ? getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water") : 0

          const elecCost = !item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? (electricMinUnit * elecRate) : elecUnitsUsed * elecRate
          const waterCost = !item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? (waterMinUnit * waterRate) : waterUnitsUsed * waterRate

          const result = await sendLineBillNotificationAction({
            lineUserId,
            roomNumber: item.roomNumber,
            tenantName: item.tenantName || (locale === "en" ? "Tenant" : "ผู้เช่า"),
            billingCycle: formatBillingCycleLocal(billingCycle, locale),
            baseRent: item.baseRent,
            electricUnits: elecUnitsUsed,
            electricAmount: elecCost,
            waterUnits: waterUnitsUsed,
            waterAmount: waterCost,
            commonFee: commonFee,
            totalAmount: item.billAmount || (item.baseRent + elecCost + waterCost + commonFee + Number(item.otherServiceAmount || 0) + Number(item.penaltyAmount || 0) + extraExpensesSum),
            workspaceName: workspaceName || (locale === "en" ? "Our Dormitory" : "หอพักของเรา"),
            workspaceId: currentWorkspaceId,
            extraExpenses,
          })

          results[item.roomNumber] = { success: result.success, error: result.error }
        } catch (err: any) {
          console.error(`Error sending LINE to room ${item.roomNumber}:`, err)
          results[item.roomNumber] = { success: false, error: err.message || (locale === "en" ? "Connection error" : "เกิดข้อผิดพลาดในการเชื่อมต่อ") }
        }
      }

      setBulkSendResults(results)
      setBulkSendingStatus("completed")
    } catch (err: any) {
      console.error("Bulk Send Action failed:", err)
      setBulkSendingStatus("idle")
      alert(locale === "en" ? "An error occurred while invoking the LINE notification system." : "เกิดข้อผิดพลาดในการเรียกใช้ระบบส่งข้อความแจ้งเตือน LINE")
    }
  }

  return (
    <>
      {/* แจ้งเตือน */}
      <div className={`flex items-center gap-2.5 p-3.5 border rounded-xl text-xs font-medium ${
        isDark 
          ? "bg-blue-950/10 border-blue-500/20 text-blue-400/90" 
          : "bg-blue-50/60 border-blue-100 text-blue-700"
      }`}>
        <Sparkles className={`w-4 h-4 shrink-0 ${isDark ? "text-blue-400" : "text-blue-500"}`} />
        <span>
          {mode === "billing" 
            ? t("billing.billing_tab_desc")
            : t("billing.meters_tab_desc")}
        </span>
      </div>

      {/* ตารางควบคุมหลัก */}
      <div className={`p-4 md:p-5 bg-transparent md:rounded-2xl md:shadow-sm ${
        isDark 
          ? "md:bg-slate-900/30 md:border md:border-slate-800/80" 
          : "md:bg-white md:border md:border-slate-200"
      }`}>
        {/* แถบควบคุมหลัก (Tabs) */}
        <div className="mb-6 flex flex-wrap justify-between items-center gap-4">
          {mode !== "billing" ? (
            /* ตัวเลือก "จดอะไร" ย้ายไปอยู่แถบหัวของหน้า /billing แล้ว (จำค่าไว้ต่อ workspace)
               เหลือไว้แค่ตัวเตือนว่ายังมีห้องที่กรอกค้างไม่ได้บันทึก ซึ่งนับจากทั้งหอ ไม่ใช่แค่ชั้นที่เห็น
               กันเคสเดินจดทีละชั้นแล้วลืมกดบันทึกชั้นก่อนหน้า */
            <div className="flex flex-wrap items-center gap-2">
              {totalUnsavedCount > 0 && (
                <div className={`flex items-center gap-2 px-3 py-1.5 xl:px-4 xl:py-2 rounded-lg text-xs xl:text-sm font-bold border ${
                  isDark
                    ? "bg-amber-500/10 border-amber-500/25 text-amber-400"
                    : "bg-amber-50 border-amber-200 text-amber-700"
                }`}>
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t("billing.unsaved_rooms_warning").replace("{count}", String(totalUnsavedCount))}</span>
                </div>
              )}
            </div>
          ) : (
            <div className={`text-xs xl:text-xs 2xl:text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              {t("billing.rental_bills_cycle")}
            </div>
          )}
          
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 xl:px-4 xl:py-2 2xl:px-4.5 2xl:py-2 rounded-lg text-[10px] xl:text-xs 2xl:text-sm font-semibold border ${
              isDark ? "bg-slate-900/30 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                activeTab === "electric" ? "bg-blue-500" : activeTab === "both" ? "bg-violet-500" : "bg-teal-500"
              }`} />
              <span>{locale === "en" ? "Cycle: " : "รอบบิล: "}{formatBillingCycleLocal(billingCycle, locale)}</span>
            </div>

            {activeTab === "all" && unifiedItems.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                {/* ปุ่มดาวน์โหลด PDF บิลรวมทุกห้อง */}
                {permissions.billing_download_pdf && handleDownloadAllBillsPdf && (
                  <button
                    type="button"
                    onClick={handleDownloadAllBillsPdf}
                    disabled={downloadingAllPdf}
                    className={`w-full sm:w-auto h-9 xl:h-10 2xl:h-11 px-4 xl:px-4.5 2xl:px-5 text-xs xl:text-xs 2xl:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 cursor-pointer ${
                      downloadingAllPdf
                        ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-md shadow-blue-500/10 hover:shadow-blue-500/20"
                    }`}
                  >
                    {downloadingAllPdf ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>{t("billing.zipping_pdf")}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        <span>{t("billing.download_all_pdf")}</span>
                      </>
                    )}
                  </button>
                )}

                {/* ปุ่มส่ง LINE OA ทุกห้องพร้อมกัน */}
                <button
                  type="button"
                  onClick={() => {
                    if (!permissions.billing_send_line) {
                      alert(t("manage_bills.err_no_permission_line"))
                      return
                    }
                    setBulkSendResults({})
                    setBulkSendingStatus("idle")
                    setBulkSendModalOpen(true)
                  }}
                  disabled={!permissions.billing_send_line}
                  className={`w-full sm:w-auto h-9 xl:h-10 2xl:h-11 px-4 xl:px-4.5 2xl:px-5 text-xs xl:text-xs 2xl:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap active:scale-[0.98] ${
                    !permissions.billing_send_line
                      ? "bg-slate-400 dark:bg-slate-850 border border-slate-300 dark:border-slate-700 text-slate-200 dark:text-slate-500 opacity-50 cursor-not-allowed"
                      : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white cursor-pointer shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20"
                  }`}
                  title={!permissions.billing_send_line ? (locale === "en" ? "You do not have permission to send LINE OA" : "คุณไม่มีสิทธิ์ในการส่ง LINE OA") : undefined}
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{t("billing.send_line_all")}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile View: Card List (< 768px) */}
        {showMobileList && (
        <div className="block md:hidden space-y-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/60 rounded-2xl shadow-sm">
              <div className="flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span>{t("billing.loading_summary")}</span>
              </div>
            </div>
          ) : unifiedItems.length > 0 ? (
            unifiedItems.map((item) => {
              const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
              const elecUnitsUsed = hasElecCurr ? getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric") : 0
              const elecCost = hasElecCurr && elecUnitsUsed >= 0
                ? (!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                : 0

              const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
              const waterUnitsUsed = hasWaterCurr ? getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water") : 0
              const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                ? (!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                : 0
              
              const roomInfo = roomInfoByNumber.get(item.roomNumber)
              const extraExpenses = roomInfo?.extraExpenses || []
              const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

              const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee + Number(item.otherServiceAmount || 0) + extraExpensesSum
              const displayedTotal = calculatedAmount + (item.penaltyAmount || 0)
              const isModified = item.billStatus !== "not_created" && item.billAmount !== displayedTotal
              
              const isElectricInvalid = hasElecCurr && elecUnitsUsed > 3000
              const isWaterInvalid = hasWaterCurr && waterUnitsUsed > 3000
              const usageAnomaly = getUsageAnomaly(item, "all")
              const isElecAnomaly = usageAnomaly.elecAbnormal
              const isWaterAnomaly = usageAnomaly.waterAbnormal
              const isMeterAlreadySaved = item.tenantName
                ? (item.isMeterSaved && item.billStatus !== "not_created" && !isModified)
                : item.isMeterSaved
              const isSaveDisabled = !hasEdit || isMeterAlreadySaved || (showElectricColumns && isElectricInvalid) || (showWaterColumns && isWaterInvalid)

              return (
                <div key={item.roomNumber} className={`p-4 rounded-2xl border space-y-4 shadow-sm ${
                  isDark ? "bg-slate-950/35 border-slate-900/60" : "bg-white border-slate-200"
                }`}>
                  {/* Card Header: Room, Tenant, Status */}
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-lg font-black px-3 py-1 rounded-xl border ${
                          isDark ? "text-slate-100 bg-slate-900 border-slate-800" : "text-slate-800 bg-slate-100 border-slate-200"
                        }`}>
                          {item.roomNumber}
                        </span>
                        {item.hasNotifiedCheckout ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            isDark 
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                              : "bg-amber-50 text-amber-700 border-amber-200"
                          }`}>
                            {t("billing.notify_checkout")}
                          </span>
                        ) : mode === "meters" ? (
                          item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              {t("billing.occupied")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-500/10 text-slate-500 dark:text-slate-400">
                              {t("billing.vacant")}
                            </span>
                          )
                        ) : activeTab === "all" && (
                          <span
                            onClick={() => {
                              if (item.billStatus === "pending") {
                                setSelectedBill(item)
                                setSlipModalOpen(true)
                              }
                            }}
                            className={`inline-block text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                              item.billStatus === "pending" ? "cursor-pointer hover:scale-105 active:scale-95 transition-all" : ""
                            } ${
                              !item.tenantName ? (isDark ? "bg-slate-800/40 text-slate-500 border border-slate-700/30" : "bg-slate-100 text-slate-450 border border-slate-200") :
                              item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200") :
                              item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse" : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse") :
                              item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                              (isDark ? "bg-slate-900 text-slate-400 border border-slate-800" : "bg-slate-100 text-slate-500 border-slate-200")
                            }`}
                            title={item.billStatus === "pending" ? (locale === "en" ? "Click to verify transfer slip" : "คลิกเพื่อตรวจสอบสลิปโอนเงิน") : undefined}
                          >
                            {!item.tenantName ? t("billing.vacant_room") :
                             item.billStatus === "paid" ? t("billing.paid") :
                             item.billStatus === "pending" ? t("billing.awaiting_verify") :
                             item.billStatus === "unpaid" ? t("billing.unpaid") : t("billing.not_created")}
                          </span>
                        )}
                      </div>
                      {mode !== "meters" && (
                        <div className={`text-xs mt-1 font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {item.tenantName ? <DynamicText>{item.tenantName}</DynamicText> : <span className="italic opacity-60">{t("billing.vacant_room")}</span>}
                        </div>
                      )}
                    </div>

                    {/* Right Block: Total Bill */}
                    {mode !== "meters" && item.tenantName && (
                      <div className="text-right flex flex-col items-end shrink-0">
                        <span className={`text-[10px] font-extrabold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-450"}`}>
                          {t("billing.total_bill")}
                        </span>
                        <div className="flex items-baseline gap-0.5 mt-0.5">
                          {item.billStatus !== "not_created" ? (
                            <>
                              <span className={`text-base font-black ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                {Number(item.billAmount !== undefined ? item.billAmount : 0).toLocaleString()}
                              </span>
                              <span className={`text-[10px] font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                {t("billing.baht_unit")}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className={`text-base font-black ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                                {displayedTotal.toLocaleString()}
                              </span>
                              <span className={`text-[10px] font-bold ${isDark ? "text-slate-550" : "text-slate-400"}`}>
                                .-
                              </span>
                            </>
                          )}
                        </div>
                        {isModified && item.billStatus !== "not_created" && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold mt-1 bg-amber-500/10 border border-amber-500/20 ${
                            isDark ? "text-amber-400" : "text-amber-600"
                          }`}>
                            {t("billing.amount_changed")}
                          </span>
                        )}
                        {item.billStatus === "not_created" && (
                          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold mt-1 bg-slate-500/10 border border-slate-500/20 ${
                            isDark ? "text-slate-450" : "text-slate-500"
                          }`}>
                            {t("billing.awaiting_bill_creation")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {item.hasNotifiedCheckout ? (
                    <div className={`p-4 rounded-xl border flex flex-col items-center text-center gap-3 ${
                      isDark 
                        ? "bg-amber-950/15 border-amber-500/25 text-amber-400" 
                        : "bg-amber-50/55 border-amber-200 text-amber-800"
                    }`}>
                      <div className={`p-2 rounded-full ${isDark ? "bg-amber-500/10" : "bg-amber-100"}`}>
                        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-extrabold text-xs sm:text-sm">
                          {t("billing.notify_checkout_title")}
                        </p>
                        <p className={`text-[10px] sm:text-xs leading-relaxed max-w-[285px] mx-auto ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {locale === "en" ? (
                          <>No regular rent billing required. Please settle accounts and return deposit in <strong className={isDark ? "text-amber-300" : "text-amber-900"}>"Manage Rooms"</strong> menu instead.</>
                        ) : (
                          <>ไม่ต้องออกบิลค่าเช่าปกติ กรุณาไปจัดการเคลียร์บัญชีและคืนเงินประกันที่เมนู <strong className={isDark ? "text-amber-300" : "text-amber-900"}>"จัดการห้อง"</strong> แทน</>
                        )}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* 1. แถบจัดการบิล (อ่านอย่างเดียว ไม่มีแบบกรอก ไม่มีปุ่มเซฟ) */}
                      {activeTab === "all" && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3.5">
                            {/* ไฟฟ้า Read-only */}
                            <div className={`rounded-xl p-3 border ${
                              isDark ? "bg-blue-950/15 border-blue-900/40" : "bg-blue-50/30 border-blue-100"
                            }`}>
                              <div className={`text-xs font-bold flex items-center gap-1 mb-1.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                                <Zap className="w-3.5 h-3.5" /> {locale === "en" ? "Electricity (kWh)" : "ไฟฟ้า (kWh)"}
                              </div>
                              <div className="font-mono text-xs">
                                <span className="text-slate-400">{locale === "en" ? "Prev: " : "ก่อน: "}{item.elecPrev}</span>
                                <span className="mx-1 text-slate-400">➔</span>
                                <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{locale === "en" ? "Curr: " : "รอบนี้: "}{item.elecCurr || "-"}</span>
                              </div>
                              {hasElecCurr && (
                                <div className="mt-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                  {elecUnitsUsed >= 0 ? (locale === "en" ? `Used ${elecUnitsUsed} units (${elecCost.toLocaleString()} THB)` : `ใช้ไป ${elecUnitsUsed} หน่วย (${elecCost.toLocaleString()}.-)`) : (locale === "en" ? "Error" : "ผิดพลาด")}
                                  {(() => {
                                    const repl = getReplacement(item.roomNumber, "electric");
                                    if (repl) {
                                      return (
                                        <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                                          {locale === "en" ? "Formula" : "สูตร"}: ({repl.oldFinalReading} - {item.elecPrev}) + ({item.elecCurr || 0} - {repl.newStartReading})
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>

                            {/* น้ำประปา Read-only */}
                            <div className={`rounded-xl p-3 border ${
                              isDark ? "bg-teal-950/15 border-teal-900/40" : "bg-teal-50/30 border-teal-100"
                            }`}>
                              <div className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 mb-1.5">
                                <Droplet className="w-3.5 h-3.5" /> {locale === "en" ? "Water (m³)" : "น้ำประปา (m³)"}
                              </div>
                              <div className="font-mono text-xs">
                                <span className="text-slate-400">{locale === "en" ? "Prev: " : "ก่อน: "}{item.waterPrev}</span>
                                <span className="mx-1 text-slate-400">➔</span>
                                <span className={`font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{locale === "en" ? "Curr: " : "รอบนี้: "}{item.waterCurr || "-"}</span>
                              </div>
                              {hasWaterCurr && (
                                <div className="mt-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                                  {waterUnitsUsed >= 0 ? (locale === "en" ? `Used ${waterUnitsUsed} units (${waterCost.toLocaleString()} THB)` : `ใช้ไป ${waterUnitsUsed} หน่วย (${waterCost.toLocaleString()}.-)`) : (locale === "en" ? "Error" : "ผิดพลาด")}
                                  {(() => {
                                    const repl = getReplacement(item.roomNumber, "water");
                                    if (repl) {
                                      return (
                                        <div className="text-[9px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
                                          {locale === "en" ? "Formula" : "สูตร"}: ({repl.oldFinalReading} - {item.waterPrev}) + ({item.waterCurr || 0} - {repl.newStartReading})
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* แก้ไขจำนวนวันปรับล่าช้าในโมบาย */}
                          {item.tenantName && item.billStatus !== "not_created" && (
                            <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                              isDark ? "bg-rose-950/10 border-rose-950/45" : "bg-rose-50/20 border-rose-100/70"
                            }`}>
                              <div className="flex flex-col">
                                <div className="text-xs font-bold text-rose-500 dark:text-rose-400">
                                  {t("billing.late_penalty_days")}
                                </div>
                                {latePenaltyRate > 0 && (
                                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                    {locale === "en" ? `${latePenaltyRate} THB/Day` : `วันละ ${latePenaltyRate}.-`}
                                    <span className="ml-1.5 text-rose-500 font-extrabold">
                                      (+{((item.lateDays || 0) * latePenaltyRate).toLocaleString()}.-)
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                  className={`w-12 text-center py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                    isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                  }`}
                                  value={item.lateDays !== undefined ? item.lateDays : 0}
                                  onChange={(e) => handleLateDaysChange?.(item.roomNumber, e.target.value)}
                                />
                                <span className="text-xs font-bold text-slate-500">{t("billing.days_unit")}</span>
                              </div>
                            </div>
                          )}

                          {/* แก้ไขค่าบริการอื่นๆในโมบาย */}
                          {item.tenantName && item.billStatus !== "not_created" && (
                            <div className={`rounded-xl p-3 border flex items-center justify-between gap-3 ${
                              isDark ? "bg-teal-950/10 border-teal-950/45" : "bg-teal-50/20 border-teal-100/70"
                            }`}>
                              <div className="flex flex-col">
                                <div className="text-xs font-bold text-teal-600 dark:text-teal-400">
                                  {t("billing.other_services_label")}
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400">
                                  {t("billing.other_services_desc")}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                  className={`w-20 text-right pr-2 py-1 border rounded-lg font-mono text-xs focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 transition-all font-semibold disabled:opacity-60 disabled:cursor-not-allowed ${
                                    isDark ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                                  }`}
                                  value={item.otherServiceAmount !== undefined ? item.otherServiceAmount : 0}
                                  onChange={(e) => handleOtherServiceChange?.(item.roomNumber, e.target.value)}
                                />
                                <span className="text-xs font-bold text-slate-500">{t("billing.baht_unit")}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 2. แถบมิเตอร์ไฟ (แก้ไขได้ & มีปุ่มเซฟมิเตอร์ไฟ) */}
                      {showElectricColumns && (
                        <div className="space-y-3">
                          <div className={`rounded-xl p-3.5 border space-y-3 ${
                            isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/50 border-blue-100"
                          }`}>
                            <div className="flex justify-between items-center gap-2">
                              <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                                <Zap className="w-3.5 h-3.5" /> {locale === "en" ? "Electricity (kWh)" : "ไฟฟ้า (kWh)"}
                              </span>
                              {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{locale === "en" ? "Previous:" : "ก่อนหน้า:"}</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={locale === "en" ? "Enter" : "กรอก"}
                                    className={`w-16 h-6.5 text-center border rounded font-mono text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all ${
                                      isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-200 text-slate-800"
                                    }`}
                                    value={item.elecPrev}
                                    onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                                  />
                                </div>
                              ) : (
                                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                                  isDark ? "bg-slate-950 border-slate-900 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"
                                }`}>
                                  {locale === "en" ? "Prev: " : "ก่อนหน้า: "}<strong className={isDark ? "text-slate-200" : "text-slate-800"}>{item.elecPrev}</strong>
                                </span>
                              )}
                            </div>
                            
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={t("billing.elec_curr_placeholder")}
                                disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                className={`w-full h-12 px-3 text-base border rounded-xl font-mono font-bold focus:outline-none focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 transition-all placeholder:text-slate-400 disabled:opacity-60 disabled:cursor-not-allowed ${
                                  isDark ? "bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-600" : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-400"
                                }`}
                                value={item.elecCurr}
                                onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                              />
                              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                                kWh
                              </span>
                            </div>

                            {/* Replacement Trigger */}
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "electric");
                              const isDisabled = item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber];
                              if (repl) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReplacementModal(item.roomNumber, "electric", repl)}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                                      isDark 
                                        ? "bg-amber-950/20 border-amber-500/30 text-amber-400 hover:bg-amber-950/30" 
                                        : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/50"
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Wrench className="w-3.5 h-3.5 animate-bounce" />
                                      <span>{t("billing.meter_replaced_mid_month")}</span>
                                    </span>
                                    <span className="font-mono text-[10px]">
                                      {repl.oldFinalReading} ➔ {repl.newStartReading}
                                    </span>
                                  </button>
                                );
                              } else {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReplacementModal(item.roomNumber, "electric")}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed text-xs font-bold transition-all ${
                                      isDark 
                                        ? "border-slate-800 text-slate-400 hover:bg-slate-900/50 hover:text-slate-300" 
                                        : "border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    <Wrench className="w-3.5 h-3.5" />
                                    <span>{t("billing.record_mid_month_replacement")}</span>
                                  </button>
                                );
                              }
                            })()}

                            {item.elecCurr !== "" && (() => {
                              const units = getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric");
                              const isRollover = isMeterRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric");
                              if (units > 3000) {
                                return (
                                  <div className="text-[10px] text-red-500 font-extrabold flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t("billing.invalid_data_limit")}</span>
                                  </div>
                                );
                              } else if (isRollover) {
                                return (
                                  <div className="text-[10px] text-amber-500 font-extrabold flex items-center gap-1 animate-pulse">
                                    <span>{t("billing.meter_rollover_msg").replace("{units}", String(units))}</span>
                                  </div>
                                );
                              } else if (isElecAnomaly) {
                                return (
                                  <div className="text-[10px] text-yellow-500 font-extrabold flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t("billing.usage_anomaly_label")}</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-500 dark:text-slate-400">{locale === "en" ? "Units Elec Used:" : "หน่วยไฟที่ใช้:"}</span>
                              <span className={`font-bold ${!hasElecCurr ? "text-slate-500 dark:text-slate-400" : elecUnitsUsed > 3000 || elecUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : isElecAnomaly ? "text-yellow-600 dark:text-yellow-400" : "text-blue-600 dark:text-blue-400"}`}>
                                {hasElecCurr ? (elecUnitsUsed > 3000 ? (locale === "en" ? "Invalid" : "ข้อมูลผิดพลาด") : elecUnitsUsed >= 0 ? `${elecUnitsUsed} ${t("billing.units_unit")}` : (locale === "en" ? "Error" : "ผิดพลาด")) : (locale === "en" ? "Awaiting" : "รอจด")}
                              </span>
                            </div>
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "electric");
                              if (repl && hasElecCurr) {
                                return (
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex justify-between">
                                    <span>{t("billing.calculation_formula")}</span>
                                    <span>({repl.oldFinalReading} - {item.elecPrev}) + ({item.elecCurr || 0} - {repl.newStartReading})</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-500 dark:text-slate-400">{t("billing.total_elec_cost")}</span>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {hasElecCurr && elecUnitsUsed >= 0 && elecUnitsUsed <= 3000
                                  ? `${elecCost.toLocaleString()} ${t("billing.baht_unit")} ${!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? `(${t("billing.min_charge")})` : ""}` 
                                  : "-"}
                              </span>
                            </div>
                          </div>

                          {/* โหมด "ไฟ+น้ำ" ใช้ปุ่มบันทึกรวมใบเดียวใต้การ์ด ไม่ใช่ปุ่มแยกของแต่ละสาธารณูปโภค */}
                          {activeTab === "electric" && !isMeterAlreadySaved && (
                            <button
                              onClick={async () => {
                                await onSaveRowWithRolloverCheck(item.roomNumber, "electric");
                              }}
                              disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                              className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                (isSaveDisabled || savingRows?.[item.roomNumber])
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                  : "bg-blue-600 hover:bg-blue-500 border border-blue-500/30 text-white shadow-lg shadow-blue-600/10 active:scale-[0.98]"
                              }`}
                            >
                              {savingRows?.[item.roomNumber] ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>{t("billing.saving")}</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" /> {t("billing.save_elec_room").replace("{roomNumber}", item.roomNumber)}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* 3. แถบมิเตอร์น้ำ (แก้ไขได้ & มีปุ่มเซฟมิเตอร์น้ำ) */}
                      {showWaterColumns && (
                        <div className="space-y-3">
                          <div className="bg-teal-50/50 dark:bg-teal-500/5 rounded-xl p-3.5 border border-teal-100 dark:border-teal-500/10 space-y-3">
                            <div className="flex justify-between items-center gap-2">
                              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1">
                                <Droplet className="w-3.5 h-3.5" /> {locale === "en" ? "Water (m³)" : "น้ำประปา (m³)"}
                              </span>
                              {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">{locale === "en" ? "Previous:" : "ก่อนหน้า:"}</span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={locale === "en" ? "Enter" : "กรอก"}
                                    className="w-16 h-6.5 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-slate-800 dark:text-slate-200 font-mono text-[10px] font-bold focus:outline-none focus:border-teal-500 transition-all"
                                    value={item.waterPrev}
                                    onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                                  />
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-950 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-900">
                                  {locale === "en" ? "Prev: " : "ก่อนหน้า: "}<strong className="text-slate-800 dark:text-slate-200">{item.waterPrev}</strong>
                                </span>
                              )}
                            </div>
                            
                            <div className="relative">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={t("billing.water_curr_placeholder")}
                                disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                className="w-full h-12 px-3 text-base bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-mono font-bold focus:outline-none focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/30 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-60 disabled:cursor-not-allowed"
                                value={item.waterCurr}
                                onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                              />
                              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-black pointer-events-none">
                                m³
                              </span>
                            </div>

                            {/* Replacement Trigger */}
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "water");
                              const isDisabled = item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber];
                              if (repl) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReplacementModal(item.roomNumber, "water", repl)}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                                      isDark 
                                        ? "bg-amber-950/20 border-amber-500/30 text-amber-400 hover:bg-amber-950/30" 
                                        : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100/50"
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <Wrench className="w-3.5 h-3.5 animate-bounce" />
                                      <span>{t("billing.meter_replaced_mid_month")}</span>
                                    </span>
                                    <span className="font-mono text-[10px]">
                                      {repl.oldFinalReading} ➔ {repl.newStartReading}
                                    </span>
                                  </button>
                                );
                              } else {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReplacementModal(item.roomNumber, "water")}
                                    disabled={isDisabled}
                                    className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed text-xs font-bold transition-all ${
                                      isDark 
                                        ? "border-slate-800 text-slate-400 hover:bg-slate-900/50 hover:text-slate-300" 
                                        : "border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                  >
                                    <Wrench className="w-3.5 h-3.5" />
                                    <span>{t("billing.record_mid_month_replacement")}</span>
                                  </button>
                                );
                              }
                            })()}

                            {item.waterCurr !== "" && (() => {
                              const units = getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water");
                              const isRollover = isMeterRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water");
                              if (units > 3000) {
                                return (
                                  <div className="text-[10px] text-red-500 font-extrabold flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t("billing.invalid_data_limit")}</span>
                                  </div>
                                );
                              } else if (isRollover) {
                                return (
                                  <div className="text-[10px] text-amber-500 font-extrabold flex items-center gap-1 animate-pulse">
                                    <span>{t("billing.meter_rollover_msg").replace("{units}", String(units))}</span>
                                  </div>
                                );
                              } else if (isWaterAnomaly) {
                                return (
                                  <div className="text-[10px] text-yellow-500 font-extrabold flex items-center gap-1">
                                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                    <span>{t("billing.usage_anomaly_label")}</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}

                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-500 dark:text-slate-400">{locale === "en" ? "Units Water Used:" : "หน่วยน้ำที่ใช้:"}</span>
                              <span className={`font-bold ${!hasWaterCurr ? "text-slate-500 dark:text-slate-400" : waterUnitsUsed > 3000 || waterUnitsUsed < 0 ? "text-red-600 dark:text-red-400" : isWaterAnomaly ? "text-yellow-600 dark:text-yellow-400" : "text-teal-600 dark:text-teal-400"}`}>
                                {hasWaterCurr ? (waterUnitsUsed > 3000 ? (locale === "en" ? "Invalid" : "ข้อมูลผิดพลาด") : waterUnitsUsed >= 0 ? `${waterUnitsUsed} ${t("billing.units_unit")}` : (locale === "en" ? "Error" : "ผิดพลาด")) : (locale === "en" ? "Awaiting" : "รอจด")}
                              </span>
                            </div>
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "water");
                              if (repl && hasWaterCurr) {
                                return (
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex justify-between">
                                    <span>{t("billing.calculation_formula")}</span>
                                    <span>({repl.oldFinalReading} - {item.waterPrev}) + ({item.waterCurr || 0} - {repl.newStartReading})</span>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-500 dark:text-slate-400">{t("billing.total_water_cost")}</span>
                              <span className="font-bold text-slate-700 dark:text-slate-300">
                                {hasWaterCurr && waterUnitsUsed >= 0 && waterUnitsUsed <= 3000
                                  ? `${waterCost.toLocaleString()} ${t("billing.baht_unit")} ${!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? `(${t("billing.min_charge")})` : ""}` 
                                  : "-"}
                              </span>
                            </div>
                          </div>

                          {activeTab === "water" && !isMeterAlreadySaved && (
                            <button
                              onClick={async () => {
                                await onSaveRowWithRolloverCheck(item.roomNumber, "water");
                              }}
                              disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                              className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                (isSaveDisabled || savingRows?.[item.roomNumber])
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                  : "bg-teal-600 hover:bg-teal-500 border border-teal-500/30 text-white shadow-lg shadow-teal-600/10 active:scale-[0.98]"
                              }`}
                            >
                              {savingRows?.[item.roomNumber] ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>{t("billing.saving")}</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" /> {t("billing.save_water_room").replace("{roomNumber}", item.roomNumber)}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}

                      {/* ปุ่มบันทึกรวมของโหมด "ไฟ+น้ำ" บนการ์ดมือถือ — บันทึกทั้งสองค่าในคราวเดียว */}
                      {activeTab === "both" && !isMeterAlreadySaved && (
                        <button
                          onClick={async () => {
                            await onSaveRowWithRolloverCheck(item.roomNumber, "all");
                          }}
                          disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                          className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            (isSaveDisabled || savingRows?.[item.roomNumber])
                              ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                              : "bg-violet-600 hover:bg-violet-500 border border-violet-500/30 text-white shadow-lg shadow-violet-600/10 active:scale-[0.98]"
                          }`}
                        >
                          {savingRows?.[item.roomNumber] ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>{t("billing.saving")}</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" /> {t("billing.save_both_room").replace("{roomNumber}", item.roomNumber)}
                            </>
                          )}
                        </button>
                      )}

                      {/* Action Buttons Section (เฉพาะแถบจัดการบิลเท่านั้น) */}
                      {activeTab === "all" && item.billStatus !== "not_created" && (
                        <div className="pt-2 space-y-2">
                          {item.isEdited ? (
                            <button
                              onClick={async () => {
                                await handleSaveLateDays?.(item.roomNumber);
                                if (item.billStatus === "paid") {
                                  setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                                }
                              }}
                              disabled={savingRows?.[item.roomNumber]}
                              className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                savingRows?.[item.roomNumber]
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                  : "bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-white shadow-lg shadow-emerald-600/10 active:scale-[0.98]"
                              }`}
                            >
                              {savingRows?.[item.roomNumber] ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>{t("billing.saving")}</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4" /> {t("billing.save_bill")}
                                </>
                              )}
                            </button>
                          ) : item.billStatus === "pending" ? (
                            <button
                              onClick={() => {
                                setSelectedBill(item)
                                setSlipModalOpen(true)
                              }}
                              className="w-full h-12 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-amber-500/10 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" /> {t("billing.check_slip")}
                            </button>
                          ) : (
                            <div className="space-y-2">
                              {/* บันทึกชำระเงินค้างชำระ */}
                              {item.billStatus === "unpaid" && (
                                <button
                                  onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                                  disabled={currentUserRole === "staff"}
                                  className={`w-full h-12 border rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm ${
                                    currentUserRole === "staff"
                                      ? "opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-850 text-slate-400 dark:text-slate-600"
                                      : "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-600/10 dark:hover:bg-emerald-600/20 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 cursor-pointer"
                                  }`}
                                  title={currentUserRole === "staff" ? t("billing.admin_only_cash") : t("billing.cash_payment")}
                                >
                                  <CheckCircle className={`w-4 h-4 ${currentUserRole === "staff" ? "text-slate-400 dark:text-slate-600" : "text-emerald-500"}`} />
                                  <span>{t("billing.cash_payment")}</span>
                                </button>
                              )}

                              {/* ปุ่มแก้ไขบิลสำหรับบิลที่ชำระเงินแล้ว */}
                              {item.billStatus === "paid" && (
                                <button
                                  onClick={() => {
                                    const isCurrentlyUnlocked = !!unlockedPaidRooms[item.roomNumber];
                                    setUnlockedPaidRooms(prev => ({
                                      ...prev,
                                      [item.roomNumber]: !isCurrentlyUnlocked
                                    }));
                                  }}
                                  className={`w-full h-12 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                    unlockedPaidRooms[item.roomNumber]
                                      ? "bg-rose-600 hover:bg-rose-500 border border-rose-500/30 text-white shadow-lg shadow-rose-600/10 active:scale-[0.98]"
                                      : "bg-blue-600 hover:bg-blue-500 border border-blue-500/30 text-white shadow-lg shadow-blue-600/10 active:scale-[0.98]"
                                  }`}
                                >
                                  {unlockedPaidRooms[item.roomNumber] ? (
                                    <>
                                      <X className="w-4 h-4" />
                                      <span>{t("billing.cancel_edit")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Edit3 className="w-4 h-4" />
                                      <span>{t("billing.edit_bill")}</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-slate-500 bg-white dark:bg-slate-950/10 border border-slate-200 dark:border-slate-900/60 rounded-2xl shadow-sm">
              {t("billing.no_rooms")}
            </div>
          )}
        </div>
        )}

        {/* Desktop View: Standard Dense Table (>= 768px) */}
        {showDesktopTable && (
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs xl:text-sm 2xl:text-base border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] xl:text-xs 2xl:text-sm font-semibold text-slate-500 dark:text-slate-450 uppercase tracking-wider bg-transparent">
                <th className="py-3.5 pl-3 w-16 xl:w-20 2xl:w-24">{locale === "en" ? "Room" : "ห้อง"}</th>
                {mode === "meters" ? (
                  <th className="py-3.5 w-40 xl:w-48 2xl:w-56">{t("billing.room_status")}</th>
                ) : (
                  <th className="py-3.5 w-40 xl:w-48 2xl:w-56">{t("billing.tenant_rent")}</th>
                )}
                
                {/* 1. แถบจัดการบิล */}
                {activeTab === "all" && (
                  <>
                    <th className="py-3.5 text-center w-44 xl:w-52 2xl:w-60 text-slate-500 dark:text-slate-450">{t("billing.elec_meter")} (kWh)</th>
                    <th className="py-3.5 text-center w-44 xl:w-52 2xl:w-60 text-slate-500 dark:text-slate-450">{t("billing.water_meter")} (m³)</th>
                    <th className="py-3.5 text-center w-36 xl:w-44 2xl:w-48 text-slate-500 dark:text-slate-450">{t("billing.other_services_label")}</th>
                    <th className="py-3.5 text-center w-36 xl:w-44 2xl:w-48 text-slate-500 dark:text-slate-450">{t("billing.late_penalty_days")}</th>
                    <th className="py-3.5 text-right pr-4 w-32 xl:w-36 2xl:w-40">{t("billing.total_bill")}</th>
                    <th className="py-3.5 text-center w-28 xl:w-32 2xl:w-36">{locale === "en" ? "Status" : "สถานะ"}</th>
                    <th className="py-3.5 text-center w-52 xl:w-60 2xl:w-68 pr-2">{t("billing.billing_management")}</th>
                  </>
                )}

                {/* 2. แถบมิเตอร์ไฟ */}
                {showElectricColumns && (
                  <>
                    <th className="py-3.5 text-center w-32 xl:w-36 2xl:w-40 text-slate-500 dark:text-slate-450">{t("billing.elec_prev")}</th>
                    <th className="py-3.5 text-center w-36 xl:w-40 2xl:w-48 text-slate-500 dark:text-slate-450">{t("billing.elec_curr")}</th>
                    <th className="py-3.5 text-center w-28 xl:w-32 2xl:w-36 text-slate-500 dark:text-slate-450">{t("billing.units_elec_amount")}</th>
                    {/* โหมด "ไฟ+น้ำ" มีปุ่มบันทึกรวมอันเดียวท้ายแถว จึงไม่ใส่หัวคอลัมน์บันทึกให้แต่ละกลุ่ม */}
                    {activeTab === "electric" && (
                      <th className="py-3.5 text-center w-40 xl:w-48 2xl:w-56 pr-2">{t("billing.save_data")}</th>
                    )}
                  </>
                )}

                {/* 3. แถบมิเตอร์น้ำ */}
                {showWaterColumns && (
                  <>
                    <th className="py-3.5 text-center w-32 xl:w-36 2xl:w-40 text-slate-500 dark:text-slate-450">{t("billing.water_prev")}</th>
                    <th className="py-3.5 text-center w-36 xl:w-40 2xl:w-48 text-slate-500 dark:text-slate-450">{t("billing.water_curr")}</th>
                    <th className="py-3.5 text-center w-28 xl:w-32 2xl:w-36 text-slate-500 dark:text-slate-450">{t("billing.units_water_amount")}</th>
                    {activeTab === "water" && (
                      <th className="py-3.5 text-center w-40 xl:w-48 2xl:w-56 pr-2">{t("billing.save_data")}</th>
                    )}
                  </>
                )}

                {/* หัวคอลัมน์ของปุ่มบันทึกรวมในโหมด "ไฟ+น้ำ" */}
                {activeTab === "both" && (
                  <th className="py-3.5 text-center w-40 xl:w-48 2xl:w-56 pr-2">{t("billing.save_data")}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan={colSpanVal} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                      <span>{t("billing.loading_summary")}</span>
                    </div>
                  </td>
                </tr>
              ) : unifiedItems.length > 0 ? (
                unifiedItems.map((item) => {
                  const hasElecCurr = item.elecCurr !== "" && item.elecCurr !== null && item.elecCurr !== undefined
                  const elecUnitsUsed = hasElecCurr ? getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric") : 0
                  const elecCost = hasElecCurr && elecUnitsUsed >= 0
                    ? (!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? electricMinUnit * elecRate : elecUnitsUsed * elecRate)
                    : 0

                  const hasWaterCurr = item.waterCurr !== "" && item.waterCurr !== null && item.waterCurr !== undefined
                  const waterUnitsUsed = hasWaterCurr ? getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water") : 0
                  const waterCost = hasWaterCurr && waterUnitsUsed >= 0
                    ? (!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? waterMinUnit * waterRate : waterUnitsUsed * waterRate)
                    : 0
                  
                  const roomInfo = roomInfoByNumber.get(item.roomNumber)
                  const extraExpenses = roomInfo?.extraExpenses || []
                  const extraExpensesSum = extraExpenses.reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0) || 0

                  const calculatedAmount = item.baseRent + elecCost + waterCost + commonFee + Number(item.otherServiceAmount || 0) + extraExpensesSum
                  const displayedTotal = calculatedAmount + (item.penaltyAmount || 0)

                  const isModified = item.billStatus !== "not_created" && item.billAmount !== displayedTotal
                  
                  const isElectricInvalid = hasElecCurr && elecUnitsUsed > 3000
                  const isWaterInvalid = hasWaterCurr && waterUnitsUsed > 3000
                  const usageAnomaly = getUsageAnomaly(item, "all")
                  const isElecAnomaly = usageAnomaly.elecAbnormal
                  const isWaterAnomaly = usageAnomaly.waterAbnormal
                  const isSaveDisabled = !hasEdit || (item.tenantName
                    ? (item.isMeterSaved && item.billStatus !== "not_created" && !isModified)
                    : item.isMeterSaved) || (showElectricColumns && isElectricInvalid) || (showWaterColumns && isWaterInvalid)

                  return (
                    <tr key={item.roomNumber} className={`transition-colors border-b border-slate-100 dark:border-slate-800/60 ${isDark ? "hover:bg-slate-900/10" : "hover:bg-slate-50/50"}`}>
                      {/* ห้อง */}
                      <td className={`py-4 pl-3 font-semibold text-sm xl:text-base 2xl:text-lg ${isDark ? "text-slate-200" : "text-slate-700"}`}>{item.roomNumber}</td>
                      
                      {/* ผู้เช่า / ค่าเช่าห้อง หรือ สถานะห้อง */}
                      <td className="py-4">
                        {mode === "meters" ? (
                          item.status === "occupied" ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] xl:text-xs 2xl:text-sm font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                              {t("billing.occupied")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] xl:text-xs 2xl:text-sm font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400">
                              {t("billing.vacant")}
                            </span>
                          )
                        ) : (
                          <>
                            <div className={`font-medium text-sm xl:text-base 2xl:text-lg truncate max-w-[160px] xl:max-w-[200px] 2xl:max-w-[240px] ${isDark ? "text-slate-200" : "text-slate-700"}`} title={item.tenantName || (locale === "en" ? "No tenant info" : "ไม่มีผู้เช่า")}>
                              {item.tenantName ? <DynamicText>{item.tenantName}</DynamicText> : <span className={isDark ? "text-slate-600 italic" : "text-slate-400 italic"}>{t("billing.no_tenant_info")}</span>}
                            </div>
                            <div className={`text-xs xl:text-sm 2xl:text-base mt-0.5 font-mono ${isDark ? "text-slate-450" : "text-slate-500"}`}>
                              {item.tenantName ? (
                                <>
                                  {locale === "en" ? "Rent" : "ค่าเช่า"} {item.baseRent.toLocaleString()} {t("billing.baht_unit")}
                                  {extraExpenses.map((exp: any, index: number) => (
                                    <div key={index} className="text-[10px] xl:text-xs 2xl:text-sm text-slate-500 dark:text-slate-440 font-medium mt-0.5">
                                      <DynamicText>{exp.name}</DynamicText> +{Number(exp.amount || 0).toLocaleString()}.-
                                    </div>
                                  ))}
                                  {Number(item.otherServiceAmount || 0) > 0 && (
                                    <div className="text-[10px] xl:text-xs 2xl:text-sm text-slate-500 dark:text-slate-440 font-medium mt-0.5">
                                      {locale === "en" ? "Other Services" : "ค่าบริการอื่นๆ"} +{Number(item.otherServiceAmount).toLocaleString()} {t("billing.baht_unit")}
                                    </div>
                                  )}
                                </>
                              ) : t("billing.vacant_room")}
                            </div>
                          </>
                        )}
                      </td>

                      {item.hasNotifiedCheckout ? (
                        <td colSpan={colSpanVal - 2} className="py-4 px-4">
                          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
                            isDark ? "bg-amber-950/15 border-amber-500/25 text-amber-400" : "bg-amber-50/55 border-amber-200 text-amber-800"
                          }`}>
                            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                              <span className="font-extrabold text-xs xl:text-sm">{t("billing.notify_checkout_title")}:</span>
                              <span className={`text-[11px] xl:text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                                {locale === "en" ? (
                          <>No regular rent billing required. Please settle accounts and return deposit in <strong className={isDark ? "text-amber-300" : "text-amber-900"}>"Manage Rooms"</strong> menu instead.</>
                        ) : (
                          <>ไม่ต้องออกบิลค่าเช่าปกติ กรุณาไปจัดการเคลียร์บัญชีและคืนเงินประกันที่เมนู <strong className={isDark ? "text-amber-300" : "text-amber-900"}>"จัดการห้อง"</strong> แทน</>
                        )}
                              </span>
                            </div>
                          </div>
                        </td>
                      ) : (
                        <>
                          {/* --- 1. แถบจัดการบิล (อ่านอย่างเดียว) --- */}
                      {activeTab === "all" && (
                        <>
                          {/* มิเตอร์ไฟฟ้า (kWh) - อ่านอย่างเดียว */}
                          <td className="py-4 text-center px-3">
                            <div className="font-mono text-xs sm:text-sm xl:text-base 2xl:text-lg font-medium">
                              <span className={isDark ? "text-slate-500" : "text-slate-400"}>{item.elecPrev}</span>
                              <span className="mx-1.5 text-slate-300 dark:text-slate-700">→</span>
                              <span className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{item.elecCurr || "-"}</span>
                            </div>
                            <div className="mt-1">
                              {hasElecCurr ? (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] xl:text-xs 2xl:text-sm font-medium ${
                                  elecUnitsUsed < 0 
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-450" 
                                    : "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
                                }`}>
                                  {elecUnitsUsed >= 0 ? `${elecUnitsUsed} ${t("billing.units_unit")} (${elecCost.toLocaleString()} ${t("billing.baht_unit")})` : (locale === "en" ? "Error" : "ผิดพลาด")}
                                </span>
                              ) : (
                                <span className="text-[10px] xl:text-xs 2xl:text-sm text-slate-400 dark:text-slate-500 italic font-medium">{t("billing.awaiting_elec")}</span>
                              )}
                            </div>
                          </td>

                          {/* มิเตอร์น้ำ (m³) - อ่านอย่างเดียว */}
                          <td className="py-4 text-center px-3">
                            <div className="font-mono text-xs sm:text-sm xl:text-base 2xl:text-lg font-medium">
                              <span className={isDark ? "text-slate-500" : "text-slate-400"}>{item.waterPrev}</span>
                              <span className="mx-1.5 text-slate-300 dark:text-slate-700">→</span>
                              <span className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-700"}`}>{item.waterCurr || "-"}</span>
                            </div>
                            <div className="mt-1">
                              {hasWaterCurr ? (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] xl:text-xs 2xl:text-sm font-medium ${
                                  waterUnitsUsed < 0 
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-450" 
                                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                }`}>
                                  {waterUnitsUsed >= 0 ? `${waterUnitsUsed} ${t("billing.units_unit")} (${waterCost.toLocaleString()} ${t("billing.baht_unit")})` : (locale === "en" ? "Error" : "ผิดพลาด")}
                                </span>
                              ) : (
                                <span className="text-[10px] xl:text-xs 2xl:text-sm text-slate-400 dark:text-slate-500 italic font-medium">{t("billing.awaiting_water")}</span>
                              )}
                            </div>
                          </td>

                          {/* ค่าบริการอื่น ๆ (บาท) */}
                          <td className="py-4 text-center px-3">
                            {item.tenantName && item.billStatus !== "not_created" ? (
                              <div className="flex items-center gap-1 justify-center">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="0"
                                  disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                  className={`w-20 xl:w-24 2xl:w-28 text-right px-2 py-1 xl:py-1.5 border rounded font-mono text-xs xl:text-sm 2xl:text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                    isDark ? "bg-slate-950 border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                                  }`}
                                  value={item.otherServiceAmount !== undefined ? item.otherServiceAmount : 0}
                                  onChange={(e) => handleOtherServiceChange?.(item.roomNumber, e.target.value)}
                                />
                                <span className={`text-[11px] xl:text-xs 2xl:text-sm font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("billing.baht_unit")}</span>
                              </div>
                            ) : (
                              <span className="text-xs xl:text-sm 2xl:text-base text-slate-400 dark:text-slate-500 font-medium">-</span>
                            )}
                          </td>

                          {/* ปรับล่าช้า (วัน) */}
                          <td className="py-4 text-center px-3">
                            {item.tenantName && item.billStatus !== "not_created" ? (
                              <div className="flex flex-col items-center">
                                <div className="flex items-center gap-1 justify-center">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                    className={`w-14 xl:w-16 2xl:w-20 text-center px-1.5 py-1 xl:py-1.5 border rounded font-mono text-xs xl:text-sm 2xl:text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                      isDark ? "bg-slate-950 border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                                    }`}
                                    value={item.lateDays !== undefined ? item.lateDays : 0}
                                    onChange={(e) => handleLateDaysChange?.(item.roomNumber, e.target.value)}
                                  />
                                  <span className={`text-[11px] xl:text-xs 2xl:text-sm font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("billing.days_unit")}</span>
                                </div>
                                {latePenaltyRate > 0 && (
                                  <span className={`text-[10px] xl:text-xs 2xl:text-sm mt-1 font-medium ${isDark ? "text-rose-400" : "text-rose-600"}`} title={t("billing.penalty_rate_per_day").replace("{rate}", String(latePenaltyRate))}>
                                    +{((item.lateDays || 0) * latePenaltyRate).toLocaleString()}.-
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs xl:text-sm 2xl:text-base text-slate-400 dark:text-slate-500 font-medium">-</span>
                            )}
                          </td>

                          {/* ยอดบิลรวม */}
                          <td className="py-4 text-right pr-4 font-mono">
                            {item.tenantName ? (
                              item.billStatus !== "not_created" ? (
                                <div className="flex flex-col items-end">
                                  <div className="flex items-center gap-1 justify-end">
                                    <span className={`font-mono text-sm xl:text-base 2xl:text-lg font-semibold ${
                                      isDark ? "text-slate-100" : "text-slate-800"
                                    }`}>
                                      {Number(item.billAmount !== undefined ? item.billAmount : 0).toLocaleString()}
                                    </span>
                                    <span className={`text-[11px] xl:text-xs 2xl:text-sm font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("billing.baht_unit")}</span>
                                  </div>
                                  {isModified && (
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] xl:text-xs 2xl:text-sm font-medium mt-1 bg-amber-500/10 border border-amber-500/20 ${
                                      isDark ? "text-amber-400" : "text-amber-600"
                                    }`}>
                                      {t("billing.amount_changed")}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <div className={`text-sm xl:text-base 2xl:text-lg font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                    {displayedTotal.toLocaleString()}.-
                                  </div>
                                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] xl:text-xs 2xl:text-sm font-medium mt-1 bg-slate-500/10 border border-slate-500/20 ${
                                    isDark ? "text-slate-450" : "text-slate-500"
                                  }`}>
                                    {t("billing.awaiting_bill_creation")}
                                  </span>
                                </div>
                              )
                            ) : (
                              <div className={`text-sm xl:text-base 2xl:text-lg font-medium ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                                -
                              </div>
                            )}
                          </td>

                          {/* สถานะบิล */}
                          <td className="py-4 text-center">
                            <span
                              onClick={() => {
                                if (item.billStatus === "pending") {
                                  setSelectedBill(item)
                                  setSlipModalOpen(true)
                                }
                              }}
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] xl:text-xs 2xl:text-sm font-medium border ${
                                item.billStatus === "pending" ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" : ""
                              } ${
                                !item.tenantName ? (isDark ? "bg-slate-800/40 text-slate-500 border-slate-700/30" : "bg-slate-100 text-slate-400 border-slate-200") :
                                item.billStatus === "paid" ? (isDark ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-emerald-50 text-emerald-600 border-emerald-200") :
                                item.billStatus === "pending" ? (isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200") :
                                item.billStatus === "unpaid" ? (isDark ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-rose-50 text-rose-600 border-rose-200") :
                                (isDark ? "bg-slate-900 text-slate-400 border-slate-800" : "bg-slate-100 text-slate-500 border-slate-200")
                              }`}
                              title={item.billStatus === "pending" ? (locale === "en" ? "Click to verify transfer slip" : "คลิกเพื่อตรวจสอบสลิปโอนเงิน") : undefined}
                            >
                              {!item.tenantName ? t("billing.vacant_room") :
                             item.billStatus === "paid" ? t("billing.paid") :
                             item.billStatus === "pending" ? t("billing.awaiting_verify") :
                             item.billStatus === "unpaid" ? t("billing.unpaid") : t("billing.not_created")}
                            </span>
                          </td>

                          {/* แถบการจัดการบิล */}
                          <td className="py-4 text-center pr-2">
                            <div className="flex items-center justify-center gap-1.5">
                              {item.isEdited ? (
                                <button
                                  onClick={async () => {
                                    await handleSaveLateDays?.(item.roomNumber);
                                    if (item.billStatus === "paid") {
                                      setUnlockedPaidRooms(prev => ({ ...prev, [item.roomNumber]: false }));
                                    }
                                  }}
                                  disabled={savingRows?.[item.roomNumber]}
                                  className={`px-2.5 py-1 xl:py-1.5 border rounded text-xs xl:text-sm 2xl:text-base font-medium transition-colors flex items-center gap-1 xl:gap-1.5 cursor-pointer ${
                                    savingRows?.[item.roomNumber]
                                      ? (isDark ? "border-slate-800/80 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                      : (isDark
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100")
                                  }`}
                                  title={locale === "en" ? "Save late penalty days to system" : "บันทึกจำนวนวันปรับล่าช้าลงระบบ"}
                                >
                                  {savingRows?.[item.roomNumber] ? (
                                    <RefreshCw className="w-3.5 h-3.5 xl:w-4 xl:h-4 animate-spin" />
                                  ) : (
                                    <Save className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                  )}
                                  <span>
                                    {savingRows?.[item.roomNumber] ? (locale === "en" ? "Saving..." : "กำลังบันทึก") : t("billing.save_bill")}
                                  </span>
                                </button>
                              ) : item.billStatus === "pending" ? (
                                <button
                                  onClick={() => {
                                    setSelectedBill(item)
                                    setSlipModalOpen(true)
                                  }}
                                  className={`px-2.5 py-1 xl:py-1.5 border rounded transition-colors text-xs xl:text-sm 2xl:text-base font-medium flex items-center gap-1 xl:gap-1.5 cursor-pointer ${
                                    isDark ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
                                  }`}
                                >
                                  <Eye className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                  <span>{t("billing.check_slip")}</span>
                                </button>
                              ) : item.billStatus !== "not_created" ? (
                                <>
                                  {/* บันทึกชำระเงินค้างชำระ */}
                                  {item.billStatus === "unpaid" && (
                                    <button
                                      onClick={() => handleMarkAsPaid(item.billId!, item.roomNumber)}
                                      disabled={currentUserRole === "staff"}
                                      className={`px-2.5 py-1 xl:py-1.5 border rounded transition-colors flex items-center gap-1 xl:gap-1.5 ${
                                        currentUserRole === "staff"
                                          ? "opacity-40 cursor-not-allowed"
                                          : "cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/30"
                                      } ${
                                        isDark ? "bg-slate-900 border-slate-800 text-slate-400" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                                      }`}
                                      title={currentUserRole === "staff" ? t("billing.admin_only_cash") : t("billing.cash_payment")}
                                    >
                                      <CheckCircle className={`w-3.5 h-3.5 xl:w-4 xl:h-4 ${currentUserRole === "staff" ? "text-slate-500 dark:text-slate-600" : "text-emerald-500"}`} />
                                      <span className="text-xs xl:text-sm 2xl:text-base font-medium">
                                        {t("billing.cash_payment_received")}
                                      </span>
                                    </button>
                                  )}

                                  {/* ปุ่มแก้ไขบิลสำหรับบิลที่ชำระเงินแล้ว */}
                                  {item.billStatus === "paid" && (
                                    <button
                                      onClick={() => {
                                        const isCurrentlyUnlocked = !!unlockedPaidRooms[item.roomNumber];
                                        setUnlockedPaidRooms(prev => ({
                                          ...prev,
                                          [item.roomNumber]: !isCurrentlyUnlocked
                                        }));
                                      }}
                                      className={`px-2.5 py-1 xl:py-1.5 border rounded transition-colors text-xs xl:text-sm 2xl:text-base font-medium flex items-center gap-1 xl:gap-1.5 cursor-pointer ${
                                        unlockedPaidRooms[item.roomNumber]
                                          ? isDark
                                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20"
                                            : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                                          : isDark
                                            ? "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850"
                                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                                      }`}
                                      title={unlockedPaidRooms[item.roomNumber] ? t("billing.lock_edit_bill") : t("billing.unlock_edit_bill")}
                                    >
                                      {unlockedPaidRooms[item.roomNumber] ? (
                                        <>
                                          <X className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                          <span>{t("billing.cancel_edit")}</span>
                                        </>
                                      ) : (
                                        <>
                                          <Edit3 className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                          <span>{t("billing.edit_bill")}</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </>
                              ) : (
                                <span className="text-xs xl:text-sm 2xl:text-base text-slate-400 dark:text-slate-500 font-medium">{t("billing.not_created")}</span>
                              )}
                            </div>
                          </td>
                        </>
                      )}

                      {/* --- 2. แถบมิเตอร์ไฟ --- */}
                      {showElectricColumns && (
                        <>
                          {/* ไฟก่อนหน้า */}
                          <td className="py-4 text-center px-2.5">
                            {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isElecPrevEditable ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={t("billing.fill_number")}
                                className={`w-20 xl:w-24 2xl:w-28 text-center px-1.5 py-1 xl:py-1.5 border rounded font-mono text-xs xl:text-sm 2xl:text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/15 transition-colors ${
                                  isDark ? "bg-slate-950 border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                                }`}
                                value={item.elecPrev}
                                onChange={(e) => handleElecPrevChange(item.roomNumber, e.target.value)}
                              />
                            ) : (
                              <span className={`font-mono text-xs xl:text-sm 2xl:text-base px-2 py-0.5 xl:px-2.5 xl:py-1 rounded border ${
                                isDark ? "text-slate-450 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-50 border-slate-200"
                              }`}>
                                {item.elecPrev}
                              </span>
                            )}
                          </td>

                          {/* ไฟรอบนี้ (Input) */}
                          <td className="py-4 text-center px-2.5">
                            <div className="relative inline-block">
                              <input
                                type="text"
                                placeholder={t("billing.fill_number")}
                                disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                className={`w-24 xl:w-28 2xl:w-32 text-left pl-2 pr-8 py-1 xl:py-1.5 border rounded font-mono text-xs xl:text-sm 2xl:text-base focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                                  isDark ? "bg-slate-950 border-slate-800/80 text-slate-100" : "bg-white border-slate-200 text-slate-800"
                                }`}
                                value={item.elecCurr}
                                onChange={(e) => handleElecChange(item.roomNumber, e.target.value)}
                              />
                              <span className={`absolute right-2 top-1/2 -translate-y-1/2 text-[10px] xl:text-xs 2xl:text-sm font-medium pointer-events-none ${
                                isDark ? "text-slate-500" : "text-slate-400"
                              }`}>
                                kWh
                              </span>
                            </div>
                            {item.elecCurr !== "" && (() => {
                              const units = getUnitsUsedWithRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric");
                              const isRollover = isMeterRollover(item.elecCurr, item.elecPrev, item.roomNumber, "electric");
                              if (units > 3000) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-rose-600 dark:text-rose-450 font-medium flex items-center justify-center gap-1 mt-1">
                                      <span>{t("billing.over_3000_warning")}</span>
                                    </div>
                                  );
                              } else if (isRollover) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center justify-center gap-1 mt-1">
                                      <span>{t("billing.rollover_short").replace("{units}", String(units))}</span>
                                    </div>
                                  );
                              } else if (isElecAnomaly) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-yellow-600 dark:text-yellow-400 font-medium flex items-center justify-center gap-1 mt-1">
                                      <span>{t("billing.usage_anomaly_short")}</span>
                                    </div>
                                  );
                              }
                              return null;
                            })()}
                            <div className="block mt-1">
                              {(() => {
                                const repl = getReplacement(item.roomNumber, "electric");
                                const isDisabled = item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber];
                                if (repl) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReplacementModal(item.roomNumber, "electric", repl)}
                                      disabled={isDisabled}
                                      title={locale === "en" ? `Meter replaced mid-month: ${repl.oldFinalReading} ➔ ${repl.newStartReading} (Click to edit/delete)` : `เปลี่ยนมิเตอร์กลางเดือน: ${repl.oldFinalReading} ➔ ${repl.newStartReading} (คลิกเพื่อแก้ไข/ลบ)`}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 xl:px-2.5 xl:py-1 rounded border text-[11px] xl:text-xs 2xl:text-sm font-medium transition-colors ${
                                        isDark 
                                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" 
                                          : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                      <Wrench className="w-3 h-3" />
                                      <span>{t("billing.replaced")} ({repl.oldFinalReading}➔{repl.newStartReading})</span>
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReplacementModal(item.roomNumber, "electric")}
                                      disabled={isDisabled}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 xl:px-2.5 xl:py-1 rounded border border-dashed text-[11px] xl:text-xs 2xl:text-sm font-medium transition-colors ${
                                        isDark 
                                          ? "border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-900/30" 
                                          : "border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                      <Wrench className="w-3 h-3" />
                                      <span>{locale === "en" ? "Replace Meter" : "เปลี่ยนมิเตอร์"}</span>
                                    </button>
                                  );
                                }
                              })()}
                            </div>
                          </td>

                          {/* หน่วย / ยอดไฟ */}
                          <td className="py-4 text-center font-mono">
                            <div className={`font-semibold text-xs sm:text-sm xl:text-base 2xl:text-lg ${!hasElecCurr ? "text-slate-400 dark:text-slate-500" : elecUnitsUsed > 3000 || elecUnitsUsed < 0 ? "text-rose-600 dark:text-rose-450" : isElecAnomaly ? "text-yellow-600 dark:text-yellow-400" : "text-indigo-600 dark:text-indigo-400"}`}>
                              {hasElecCurr ? (elecUnitsUsed > 3000 ? t("billing.invalid_data") : elecUnitsUsed >= 0 ? `${elecUnitsUsed} ${t("billing.units_unit")}` : t("billing.error")) : t("billing.awaiting_reading")}
                            </div>
                            <div className="text-[11px] xl:text-xs 2xl:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              {hasElecCurr && elecUnitsUsed >= 0 && elecUnitsUsed <= 3000
                                ? `${elecCost.toLocaleString()}.- ${!item.waiveElectricMin && electricMinChecked && elecUnitsUsed <= electricMinUnit ? t("billing.min_charge_short") : ""}`
                                : "-"}
                            </div>
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "electric");
                              if (repl && hasElecCurr && elecUnitsUsed >= 0 && elecUnitsUsed <= 3000) {
                                  return (
                                    <div 
                                      className={`mt-1 text-[10px] xl:text-xs 2xl:text-sm leading-tight px-1.5 py-0.5 rounded font-medium max-w-[130px] xl:max-w-[160px] mx-auto cursor-help ${
                                        isDark ? "bg-slate-800/40 text-slate-400" : "bg-slate-50 text-slate-500 border border-slate-100"
                                      }`}
                                      title={locale === "en" ? `Mid-month replaced meter calculation formula:\n(Old meter final: ${repl.oldFinalReading} - Prev: ${item.elecPrev}) + (Current: ${item.elecCurr || 0} - New meter start: ${repl.newStartReading})` : `{t("billing.replacement_formula_desc")}\n(มิเตอร์เก่าเสีย: ${repl.oldFinalReading} - ก่อนหน้า: ${item.elecPrev}) + (จดรอบนี้: ${item.elecCurr || 0} - มิเตอร์ใหม่เริ่ม: ${repl.newStartReading})`}
                                    >
                                      ({repl.oldFinalReading}-{item.elecPrev}) + ({item.elecCurr || 0}-{repl.newStartReading})
                                    </div>
                                  );
                              }
                              return null;
                            })()}
                          </td>

                          {/* บันทึก — เฉพาะโหมดจดไฟเดี่ยว ๆ โหมด "ไฟ+น้ำ" ใช้ปุ่มบันทึกรวมท้ายแถวแทน
                              ไม่เช่นนั้นจะมีปุ่มบันทึกสองอันในแถวเดียวและจำนวนคอลัมน์ไม่ตรงกับหัวตาราง */}
                          {activeTab === "electric" && (
                            <td className="py-4 text-center pr-2">
                              <button
                                onClick={async () => {
                                  await onSaveRowWithRolloverCheck(item.roomNumber, "electric");
                                }}
                                disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                                className={`px-2.5 py-1 xl:py-1.5 border rounded text-xs xl:text-sm 2xl:text-base font-medium transition-colors flex items-center gap-1.5 mx-auto cursor-pointer ${
                                  (isSaveDisabled || savingRows?.[item.roomNumber])
                                    ? (isDark ? "border-slate-800/80 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                    : (isDark ? "border-indigo-500/20 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400" : "border-indigo-250 bg-indigo-50 hover:bg-indigo-100 text-indigo-700")
                                }`}
                              >
                                {savingRows?.[item.roomNumber] ? (
                                  <RefreshCw className="w-3.5 h-3.5 xl:w-4 xl:h-4 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                )}
                                <span>{t("billing.save_elec_meter")}</span>
                              </button>
                            </td>
                          )}
                        </>
                      )}

                      {/* --- 3. แถบมิเตอร์น้ำ --- */}
                      {showWaterColumns && (
                        <>
                          {/* น้ำก่อนหน้า */}
                          <td className="py-4 text-center px-2.5 bg-teal-500/[0.015] dark:bg-teal-500/[0.02] rounded-l-xl">
                            {(item.billStatus === "not_created" || item.billStatus === "unpaid") && item.isWaterPrevEditable ? (
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={t("billing.fill_number")}
                                className={`w-28 xl:w-32 2xl:w-36 h-11 text-center font-mono text-sm xl:text-base 2xl:text-lg font-semibold rounded-xl border transition-all focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 ${
                                  isDark ? "bg-slate-950 border-slate-800/80 text-slate-100" : "bg-white border-slate-250 text-slate-800"
                                }`}
                                value={item.waterPrev}
                                onChange={(e) => handleWaterPrevChange(item.roomNumber, e.target.value)}
                              />
                            ) : (
                              <span className={`font-mono text-xs xl:text-sm 2xl:text-base px-3 py-1.5 rounded-lg border font-semibold inline-block ${
                                isDark ? "text-slate-300 bg-slate-900/50 border-slate-800/40" : "text-slate-600 bg-slate-50 border-slate-200"
                              }`}>
                                {item.waterPrev}
                              </span>
                            )}
                          </td>

                          {/* น้ำรอบนี้ (Input) */}
                          <td className="py-4 text-center px-2.5 bg-teal-500/[0.015] dark:bg-teal-500/[0.02]">
                            <div className="relative inline-block">
                              <input
                                type="text"
                                placeholder={t("billing.fill_number")}
                                disabled={!hasEdit || (item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber])}
                                className={`w-32 xl:w-36 2xl:w-40 h-11 text-center font-mono text-sm xl:text-base 2xl:text-lg font-semibold rounded-xl border transition-all focus:outline-none focus:ring-4 disabled:opacity-60 disabled:cursor-not-allowed ${
                                  isDark 
                                    ? "bg-slate-950 border-slate-800/80 text-slate-100 placeholder:text-slate-600 focus:border-teal-500 focus:ring-teal-500/10" 
                                    : "bg-white border-slate-250 text-slate-800 placeholder:text-slate-400 focus:border-teal-500 focus:ring-teal-500/10"
                                }`}
                                value={item.waterCurr}
                                onChange={(e) => handleWaterChange(item.roomNumber, e.target.value)}
                              />
                              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] xl:text-xs 2xl:text-sm font-bold pointer-events-none ${
                                isDark ? "text-slate-500" : "text-slate-400"
                              }`}>
                                m³
                              </span>
                            </div>
                            {item.waterCurr !== "" && (() => {
                              const units = getUnitsUsedWithRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water");
                              const isRollover = isMeterRollover(item.waterCurr, item.waterPrev, item.roomNumber, "water");
                              if (units > 3000) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-rose-600 dark:text-rose-450 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-lg font-medium flex items-center justify-center gap-1 mt-1.5 max-w-[130px] mx-auto">
                                      <span>{t("billing.over_3000_warning")}</span>
                                    </div>
                                  );
                              } else if (isRollover) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg font-medium flex items-center justify-center gap-1 mt-1.5 max-w-[130px] mx-auto">
                                      <span>{t("billing.rollover_short").replace("{units}", String(units))}</span>
                                    </div>
                                  );
                              } else if (isWaterAnomaly) {
                                  return (
                                    <div className="text-[11px] xl:text-xs 2xl:text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 rounded-lg font-medium flex items-center justify-center gap-1 mt-1.5 max-w-[130px] mx-auto">
                                      <span>{t("billing.usage_anomaly_short")}</span>
                                    </div>
                                  );
                              }
                              return null;
                            })()}
                            <div className="block mt-1.5">
                              {(() => {
                                const repl = getReplacement(item.roomNumber, "water");
                                const isDisabled = item.billStatus === "paid" && !unlockedPaidRooms[item.roomNumber];
                                if (repl) {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReplacementModal(item.roomNumber, "water", repl)}
                                      disabled={isDisabled}
                                      title={locale === "en" ? `Meter replaced mid-month: ${repl.oldFinalReading} ➔ ${repl.newStartReading} (Click to edit/delete)` : `เปลี่ยนมิเตอร์กลางเดือน: ${repl.oldFinalReading} ➔ ${repl.newStartReading} (คลิกเพื่อแก้ไข/ลบ)`}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 xl:px-3 xl:py-1.5 rounded-xl border text-[11px] xl:text-xs 2xl:text-sm font-semibold transition-all ${
                                        isDark 
                                          ? "bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20" 
                                          : "bg-amber-50 border-amber-200 text-amber-750 hover:bg-amber-100"
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                      <Wrench className="w-3 h-3" />
                                      <span>{t("billing.replaced")} ({repl.oldFinalReading}➔{repl.newStartReading})</span>
                                    </button>
                                  );
                                } else {
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenReplacementModal(item.roomNumber, "water")}
                                      disabled={isDisabled}
                                      className={`inline-flex items-center gap-1 px-2.5 py-1 xl:px-3 xl:py-1.5 rounded-xl border border-dashed text-[11px] xl:text-xs 2xl:text-sm font-semibold transition-all ${
                                        isDark 
                                          ? "border-slate-800 text-slate-500 hover:text-slate-450 hover:bg-slate-900/30" 
                                          : "border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                      <Wrench className="w-3 h-3" />
                                      <span>{locale === "en" ? "Replace Meter" : "เปลี่ยนมิเตอร์"}</span>
                                    </button>
                                  );
                                }
                              })()}
                            </div>
                          </td>

                          {/* หน่วย / ยอดน้ำ */}
                          <td className="py-4 text-center font-mono bg-teal-500/[0.015] dark:bg-teal-500/[0.02]">
                            <div className={`font-bold text-sm sm:text-base xl:text-lg 2xl:text-xl ${!hasWaterCurr ? "text-slate-400 dark:text-slate-500" : waterUnitsUsed > 3000 || waterUnitsUsed < 0 ? "text-rose-600 dark:text-rose-450" : isWaterAnomaly ? "text-yellow-600 dark:text-yellow-400" : "text-teal-600 dark:text-teal-400"}`}>
                              {hasWaterCurr ? (waterUnitsUsed > 3000 ? t("billing.invalid_data") : waterUnitsUsed >= 0 ? `${waterUnitsUsed} ${t("billing.units_unit")}` : t("billing.error")) : t("billing.awaiting_reading")}
                            </div>
                            <div className="mt-1 flex items-center justify-center">
                              {hasWaterCurr && waterUnitsUsed >= 0 && waterUnitsUsed <= 3000 ? (
                                <span className={`inline-flex items-center px-2.5 py-0.5 xl:py-1 rounded-lg border text-xs xl:text-sm 2xl:text-base font-bold ${
                                  isDark ? "bg-teal-500/10 border-teal-500/20 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-750"
                                }`}>
                                  {waterCost.toLocaleString()}.- {!item.waiveWaterMin && waterMinChecked && waterUnitsUsed <= waterMinUnit ? " " + t("billing.min_charge_short") : ""}
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 text-xs xl:text-sm 2xl:text-base">-</span>
                              )}
                            </div>
                            {(() => {
                              const repl = getReplacement(item.roomNumber, "water");
                              if (repl && hasWaterCurr && waterUnitsUsed >= 0 && waterUnitsUsed <= 3000) {
                                  return (
                                    <div 
                                      className={`mt-1.5 text-[10px] xl:text-xs 2xl:text-sm leading-tight px-1.5 py-0.5 rounded font-medium max-w-[130px] mx-auto cursor-help ${
                                        isDark ? "bg-slate-800/40 text-slate-400" : "bg-slate-50 text-slate-500 border border-slate-100"
                                      }`}
                                      title={locale === "en" ? `Mid-month replaced meter calculation formula:\n(Old meter final: ${repl.oldFinalReading} - Prev: ${item.waterPrev}) + (Current: ${item.waterCurr || 0} - New meter start: ${repl.newStartReading})` : `สูตรคำนวณมิเตอร์เสียกลางเดือน:\n(มิเตอร์เก่าเสีย: ${repl.oldFinalReading} - ก่อนหน้า: ${item.waterPrev}) + (จดรอบนี้: ${item.waterCurr || 0} - มิเตอร์ใหม่เริ่ม: ${repl.newStartReading})`}
                                    >
                                      ({repl.oldFinalReading}-{item.waterPrev}) + ({item.waterCurr || 0}-{repl.newStartReading})
                                    </div>
                                  );
                              }
                              return null;
                            })()}
                          </td>

                          {/* บันทึก — เฉพาะโหมดจดน้ำเดี่ยว ๆ (ดูหมายเหตุที่ปุ่มบันทึกของแถบมิเตอร์ไฟ) */}
                          {activeTab === "water" && (
                            <td className="py-4 text-center pr-2 bg-teal-500/[0.015] dark:bg-teal-500/[0.02] rounded-r-xl">
                              <button
                                onClick={async () => {
                                  await onSaveRowWithRolloverCheck(item.roomNumber, "water");
                                }}
                                disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                                className={`h-11 px-4 xl:px-5 rounded-xl text-xs xl:text-sm 2xl:text-base font-bold transition-all border flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                                  (isSaveDisabled || savingRows?.[item.roomNumber])
                                    ? (isDark ? "border-slate-850 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                    : (isDark ? "border-teal-500/20 bg-teal-500/10 hover:bg-teal-600 text-teal-400 hover:text-white" : "border-teal-200 bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white")
                                }`}
                              >
                                {savingRows?.[item.roomNumber] ? (
                                  <RefreshCw className="w-3.5 h-3.5 xl:w-4 xl:h-4 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                                )}
                                <span>{t("billing.save_water_meter")}</span>
                              </button>
                            </td>
                          )}
                        </>
                      )}

                      {/* ปุ่มบันทึกรวมของโหมด "ไฟ+น้ำ" — บันทึกทั้งสองค่าในคราวเดียว (type "all")
                          อยู่นอกกลุ่มคอลัมน์ไฟ/น้ำ เพื่อให้เป็นคอลัมน์สุดท้ายเสมอตามหัวตาราง */}
                      {activeTab === "both" && (
                        <td className="py-4 text-center pr-2">
                          <button
                            onClick={async () => {
                              await onSaveRowWithRolloverCheck(item.roomNumber, "all");
                            }}
                            disabled={isSaveDisabled || savingRows?.[item.roomNumber]}
                            className={`h-11 px-4 xl:px-5 rounded-xl text-xs xl:text-sm 2xl:text-base font-bold transition-all border flex items-center justify-center gap-1.5 mx-auto cursor-pointer ${
                              (isSaveDisabled || savingRows?.[item.roomNumber])
                                ? (isDark ? "border-slate-850 bg-slate-950/20 text-slate-600 cursor-not-allowed" : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed")
                                : (isDark ? "border-violet-500/20 bg-violet-500/10 hover:bg-violet-600 text-violet-400 hover:text-white" : "border-violet-200 bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white")
                            }`}
                          >
                            {savingRows?.[item.roomNumber] ? (
                              <RefreshCw className="w-3.5 h-3.5 xl:w-4 xl:h-4 animate-spin" />
                            ) : (
                              <Save className="w-3.5 h-3.5 xl:w-4 xl:h-4" />
                            )}
                            <span>{t("billing.save_both_meter")}</span>
                          </button>
                        </td>
                      )}
                    </>
                  )}
                </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={colSpanVal} className="py-12 text-center text-slate-500">
                    {t("billing.no_occupied_rooms")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* ปุ่มบันทึกข้อมูลมิเตอร์ทั้งหมดในขอบเขตที่เห็น (Bulk Save — ไม่แสดงในแถบจัดการบิล)
            จำนวนห้องและ label อ้างจาก unifiedItems ที่ได้รับมา ซึ่งผ่านตัวกรองอาคาร/ชั้นแล้ว
            จึงตรงกับสิ่งที่จะถูกบันทึกจริงเสมอ */}
        {!loading && unifiedItems.length > 0 && activeTab !== "all" && (
          <div className="mt-6 flex justify-center px-4 md:px-0 pb-4">
            <button
              onClick={async () => {
                await onSaveAllWithRolloverCheck(activeTab);
              }}
              disabled={!hasEdit}
              className={`w-full md:w-auto min-w-[240px] px-6 py-2.5 rounded-lg border text-xs font-medium transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer ${
                activeTab === "electric"
                  ? (isDark
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/30"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600")
                  : activeTab === "both"
                    ? (isDark
                      ? "bg-violet-600 hover:bg-violet-500 text-white border-violet-500/30"
                      : "bg-violet-600 hover:bg-violet-700 text-white border-violet-600")
                    : (isDark
                      ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500/30"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600")
              }`}
            >
              <Save className="w-4 h-4 text-white" />
              <span>
                {(activeTab === "electric"
                  ? t("billing.save_all_elec_count")
                  : activeTab === "both"
                    ? t("billing.save_all_both_count")
                    : t("billing.save_all_water_count")
                ).replace("{count}", String(unifiedItems.length))}
                {activeFloorLabel && t("billing.save_all_floor_suffix").replace("{floor}", activeFloorLabel)}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* โมดอลสำหรับส่ง LINE OA แบบกลุ่ม */}
      {bulkSendModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 sm:p-6 md:p-10 bg-black/75 backdrop-blur-md">
          <div className={`w-full max-w-xl md:max-w-4xl rounded-3xl relative shadow-2xl border flex flex-col ${
            isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
          }`}>
            {/* ปุ่มปิด */}
            <button
              onClick={() => {
                if (bulkSendingStatus !== "sending") {
                  setBulkSendModalOpen(false)
                }
              }}
              disabled={bulkSendingStatus === "sending"}
              className={`absolute top-5 right-5 p-1.5 rounded-lg transition-all z-10 ${
                bulkSendingStatus === "sending" ? "opacity-30 cursor-not-allowed" : "cursor-pointer"
              } ${
                isDark ? "text-slate-400 hover:text-white hover:bg-slate-900/50" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="max-h-[85vh] overflow-y-auto p-5 sm:p-6 md:p-8 flex flex-col w-full">

            {/* ส่วนหัวโมดอล */}
            <div className="mb-4">
              <h3 className={`text-lg md:text-xl font-black flex items-center gap-2.5 ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                <MessageSquare className={`w-5 h-5 md:w-6 md:h-6 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                <span>{t("billing.bulk_send_title")}</span>
              </h3>
              <p className={`text-xs md:text-sm mt-1.5 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                {t("billing.bulk_send_subtitle")}
              </p>
            </div>

            {/* การ์ดสรุปสถานะการผูก LINE */}
            <div className="grid grid-cols-3 gap-2.5 mb-5">
              <div className={`p-3 rounded-xl border text-center ${
                isDark ? "bg-slate-950/40 border-slate-850" : "bg-slate-50 border-slate-150"
              }`}>
                <div className={`text-xs font-bold ${isDark ? "text-slate-500" : "text-slate-400"}`}>{t("billing.tenants_with_bills")}</div>
                <div className={`text-sm md:text-xl font-black mt-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  {activeRooms.length} <span className="text-xs font-medium">{t("billing.rooms_count_unit")}</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl border text-center bg-emerald-500/5 border-emerald-500/20`}>
                <div className="text-xs font-bold text-emerald-500">{t("billing.line_connected")}</div>
                <div className="text-sm md:text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {connectedRooms.length} <span className="text-xs font-medium">{t("billing.rooms_count_unit")}</span>
                </div>
              </div>
              <div className={`p-3 rounded-xl border text-center bg-amber-500/5 border-amber-500/20`}>
                <div className="text-xs font-bold text-amber-500">{t("billing.line_unconnected")}</div>
                <div className="text-sm md:text-xl font-black text-amber-600 dark:text-amber-400 mt-1">
                  {unconnectedRooms.length} <span className="text-xs font-medium">{t("billing.rooms_count_unit")}</span>
                </div>
              </div>
            </div>

            {/* แถบเลือกสลับกลุ่ม (พร้อมส่ง vs ไม่ได้ผูก) */}
            <div className={`flex p-1 rounded-xl mb-4 self-start shadow-inner border ${
              isDark ? "bg-slate-950/40 border-slate-850" : "bg-slate-100 border-slate-200"
            }`}>
              <button
                onClick={() => setModalActiveTab("connected")}
                className={`px-4.5 py-2 rounded-lg text-sm font-extrabold transition-all cursor-pointer ${
                  modalActiveTab === "connected"
                    ? (isDark ? "bg-slate-900 text-emerald-400 border border-slate-800" : "bg-white text-emerald-600 border border-slate-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-400" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                {t("billing.ready_auto_send").replace("{count}", String(connectedRooms.length))}
              </button>
              <button
                onClick={() => setModalActiveTab("unconnected")}
                className={`px-4.5 py-2 rounded-lg text-sm font-extrabold transition-all cursor-pointer ${
                  modalActiveTab === "unconnected"
                    ? (isDark ? "bg-slate-900 text-amber-400 border border-slate-800" : "bg-white text-amber-600 border border-slate-200 shadow-sm")
                    : (isDark ? "text-slate-500 hover:text-slate-400" : "text-slate-500 hover:text-slate-700")
                }`}
              >
                {t("billing.manual_send").replace("{count}", String(unconnectedRooms.length))}
              </button>
            </div>

            {/* เนื้อหาหลักในโมดอล */}
            <div className={`flex-1 border rounded-2xl p-4 sm:p-5 overflow-y-auto min-h-[220px] max-h-[350px] mb-5 ${
              isDark ? "bg-slate-950/20 border-slate-850" : "bg-slate-50 border-slate-150"
            }`}>
              
              {/* แถบผู้ที่เชื่อมต่อ LINE แล้ว */}
              {modalActiveTab === "connected" && (
                <div className="space-y-2.5">
                  {connectedRooms.length > 0 ? (
                    connectedRooms.map(item => {
                      const result = bulkSendResults[item.roomNumber]
                      const isCopied = copiedRooms[item.roomNumber]
                      return (
                        <div key={item.roomNumber} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border text-sm gap-3.5 transition-all ${
                          isDark ? "bg-slate-900/60 border-slate-850" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center gap-2 flex-nowrap min-w-0">
                            <span className={`font-black text-sm px-2.5 py-1 rounded-lg border shrink-0 ${
                              isDark ? "bg-slate-950 text-slate-200 border-slate-800" : "bg-slate-50 text-slate-700 border-slate-200"
                            }`}>
                              {t("billing.room_label").replace("{roomNumber}", item.roomNumber)}
                            </span>
                            <span className={`font-extrabold truncate max-w-[140px] sm:max-w-none ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              <DynamicText>{item.tenantName}</DynamicText>
                            </span>
                            <span className={`text-sm font-mono font-semibold shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              ({item.billAmount?.toLocaleString()}.-)
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap sm:flex-nowrap justify-end">
                            {/* คัดลอกลิงก์ portal */}
                            <button
                              onClick={() => handleCopyPortalLink(item)}
                              disabled={!permissions.billing_copy_summary}
                              className={`h-8 px-3 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                                !permissions.billing_copy_summary
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50"
                                  : copiedLinks[item.roomNumber]
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : isDark 
                                      ? "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-200 cursor-pointer" 
                                      : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 cursor-pointer"
                              }`}
                              title={!permissions.billing_copy_summary ? (locale === "en" ? "You do not have permission to copy portal link" : "คุณไม่มีสิทธิ์ในการคัดลอกลิงก์ portal") : undefined}
                            >
                              {copiedLinks[item.roomNumber] ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="whitespace-nowrap">{t("billing.copied_success")}</span>
                                </>
                              ) : (
                                <>
                                  <Link className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                                  <span className="whitespace-nowrap">{t("billing.copy_portal_link")}</span>
                                </>
                              )}
                            </button>

                            {bulkSendingStatus === "idle" && (
                              <button
                                onClick={() => {
                                  if (item.billStatus === "paid") {
                                    alert(locale === "en" ? `Room ${item.roomNumber} is already paid` : `ห้อง ${item.roomNumber} ชำระเงินแล้ว`)
                                    return
                                  }
                                  handleSendLine(item.roomNumber)
                                }}
                                disabled={!permissions.billing_send_line}
                                className={`h-8 px-3 rounded-lg text-sm font-black flex items-center justify-center gap-1.5 transition-all shadow-sm ${
                                  !permissions.billing_send_line
                                    ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50"
                                    : item.billStatus === "paid"
                                      ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                                      : isDark 
                                        ? "bg-emerald-950/30 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-900/30 hover:text-emerald-300 cursor-pointer" 
                                        : "bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 hover:text-emerald-800 cursor-pointer"
                                }`}
                                title={!permissions.billing_send_line ? (locale === "en" ? "You do not have permission to send LINE OA" : "คุณไม่มีสิทธิ์ในการส่ง LINE OA") : item.billStatus === "paid" ? (locale === "en" ? `Room ${item.roomNumber} is paid` : `ห้อง ${item.roomNumber} ชำระเงินแล้ว`) : undefined}
                              >
                                <Send className="w-3 h-3" />
                                <span className="whitespace-nowrap">{t("billing.send_line_oa")}</span>
                              </button>
                            )}
                            {bulkSendingStatus === "sending" && bulkSendingProgress.currentRoom === item.roomNumber && (
                              <span className="text-sm font-bold text-blue-500 bg-blue-500/10 px-2.5 py-0.5 rounded-full border border-blue-500/20 animate-pulse whitespace-nowrap">
                                {t("billing.sending")}
                              </span>
                            )}
                            {bulkSendingStatus === "sending" && !result && bulkSendingProgress.currentRoom !== item.roomNumber && (
                              <span className="text-sm font-semibold text-slate-450 dark:text-slate-500 whitespace-nowrap">
                                {t("billing.queueing")}
                              </span>
                            )}
                            {result && (
                              result.success ? (
                                <span className="text-sm font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap">
                                  {t("billing.success_tick")}
                                </span>
                              ) : (
                                <span 
                                  className={`text-sm font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                                    result.error === (locale === "en" ? "Paid" : "ชำระเงินแล้ว")
                                      ? "text-blue-500 bg-blue-500/10 border-blue-500/20"
                                      : "text-red-500 bg-red-500/10 border-red-500/20"
                                  }`} 
                                  title={result.error}
                                >
                                  {result.error === (locale === "en" ? "Paid" : "ชำระเงินแล้ว") ? t("billing.paid_money_bag") : t("billing.failed_cross")}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      {t("billing.no_connected_tenants_cycle")}
                    </div>
                  )}
                </div>
              )}

              {/* แถบผู้ที่ยังไม่ได้เชื่อมต่อ LINE */}
              {modalActiveTab === "unconnected" && (
                <div className="space-y-3">
                  <div className={`p-3.5 rounded-xl border text-xs md:text-sm font-medium leading-relaxed mb-1 flex gap-2.5 ${
                    isDark ? "bg-amber-500/5 border-amber-500/10 text-amber-400" : "bg-amber-50/50 border-amber-100 text-amber-700"
                  }`}>
                    <AlertCircle className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
                    <span>
                      <strong>{t("billing.advice_label")}</strong> {t("billing.unconnected_advice_desc")}
                    </span>
                  </div>

                  {unconnectedRooms.length > 0 ? (
                    unconnectedRooms.map(item => {
                      const isCopied = copiedRooms[item.roomNumber]
                      return (
                        <div key={item.roomNumber} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border text-sm gap-3.5 transition-all ${
                          isDark ? "bg-slate-900/60 border-slate-850" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center gap-2 flex-nowrap min-w-0">
                            <span className={`font-black text-sm px-2.5 py-1 rounded-lg border shrink-0 ${
                              isDark ? "bg-slate-950 text-slate-200 border-slate-800" : "bg-slate-50 text-slate-700 border-slate-200"
                            }`}>
                              {t("billing.room_label").replace("{roomNumber}", item.roomNumber)}
                            </span>
                            <span className={`font-extrabold truncate max-w-[140px] sm:max-w-none ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                              <DynamicText>{item.tenantName}</DynamicText>
                            </span>
                            <span className={`text-sm font-mono font-semibold shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                              ({item.billAmount?.toLocaleString()}.-)
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap sm:flex-nowrap justify-end">
                            {/* ดาวน์โหลด PDF */}
                            <button
                              onClick={() => handleDownloadBillPdf(item)}
                              disabled={downloadingPdfId !== null || !permissions.billing_download_pdf}
                              className={`h-9 px-3.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                                !permissions.billing_download_pdf
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50"
                                  : downloadingPdfId !== null
                                    ? "opacity-45 cursor-not-allowed"
                                    : isDark 
                                      ? "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-200 hover:text-blue-400 cursor-pointer" 
                                      : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 hover:text-blue-600 cursor-pointer"
                              }`}
                              title={!permissions.billing_download_pdf ? (locale === "en" ? "You do not have permission to download PDF" : "คุณไม่มีสิทธิ์ในการดาวน์โหลด PDF") : undefined}
                            >
                              {downloadingPdfId === item.roomNumber ? (
                                <div className="w-3.5 h-3.5 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>
                                  <Download className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                                  <span className="whitespace-nowrap">{t("billing.download_pdf")}</span>
                                </>
                              )}
                            </button>

                            {/* คัดลอกสรุปบิล */}
                            <button
                              onClick={() => handleCopySummary(item)}
                              disabled={!permissions.billing_copy_summary}
                              className={`h-9 px-3.5 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                                !permissions.billing_copy_summary
                                  ? "bg-slate-100 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-900 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-50"
                                  : isCopied
                                    ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                    : isDark 
                                      ? "bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-200 cursor-pointer" 
                                      : "bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 cursor-pointer"
                              }`}
                              title={!permissions.billing_copy_summary ? (locale === "en" ? "You do not have permission to copy summary" : "คุณไม่มีสิทธิ์ในการคัดลอกสรุปบิล") : undefined}
                            >
                              {isCopied ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="whitespace-nowrap">{t("billing.copied_summary_success")}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span className="whitespace-nowrap">{t("billing.copy_summary")}</span>
                                </>
                              )}
                            </button>

                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-500 text-sm">
                      {t("billing.all_connected_no_pending")}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* แถบแจ้งเตือนความคืบหน้าขณะกำลังส่ง (Progress bar) */}
            {bulkSendingStatus === "sending" && (
              <div className={`p-4 rounded-2xl border mb-5 space-y-2.5 ${
                isDark ? "bg-slate-950 border-slate-850" : "bg-blue-50/30 border-blue-100"
              }`}>
                <div className="flex justify-between text-sm font-bold font-mono">
                  <span className={isDark ? "text-slate-300" : "text-slate-700"}>
                    {t("billing.sending_room").replace("{roomNumber}", bulkSendingProgress.currentRoom)}
                  </span>
                  <span className="text-blue-500">
                    {bulkSendingProgress.current} / {bulkSendingProgress.total} {t("billing.rooms_count_unit")}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(bulkSendingProgress.current / bulkSendingProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 italic text-center animate-pulse">
                  {t("billing.do_not_close_page")}
                </p>
              </div>
            )}

            {/* กล่องแสดงสรุปเมื่อส่งเสร็จสิ้น */}
            {bulkSendingStatus === "completed" && (
              <div className={`p-4 rounded-2xl border mb-5 text-center ${
                isDark ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}>
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-black">{t("billing.bulk_send_completed_title")}</h4>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {t("billing.bulk_send_completed_desc").replace("{successCount}", String(Object.values(bulkSendResults).filter(r => r.success).length)).replace("{totalCount}", String(connectedRooms.length))}
                </p>
              </div>
            )}

            {/* ส่วนควบคุมท้ายสุด */}
            <div className="flex justify-end gap-2.5 text-sm font-bold pt-3.5 border-t dark:border-slate-800">
              <button
                onClick={() => setBulkSendModalOpen(false)}
                disabled={bulkSendingStatus === "sending"}
                className={`px-5 py-3 rounded-xl border cursor-pointer transition-all ${
                  isDark ? "bg-slate-950 border-slate-850 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                } ${bulkSendingStatus === "sending" ? "opacity-30 cursor-not-allowed" : ""}`}
              >
                {bulkSendingStatus === "completed" ? t("billing.close_window") : (locale === "en" ? "Cancel" : "ยกเลิก")}
              </button>

              {modalActiveTab === "connected" && bulkSendingStatus !== "completed" && connectedRooms.length > 0 && (
                <button
                  onClick={startBulkSend}
                  disabled={bulkSendingStatus === "sending" || !permissions.billing_send_line}
                  className={`px-6 py-3 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-[0.98] ${
                    !permissions.billing_send_line
                      ? "bg-slate-400 dark:bg-slate-850 border border-slate-300 dark:border-slate-800 text-slate-200 dark:text-slate-500 opacity-50 cursor-not-allowed shadow-none"
                      : bulkSendingStatus === "sending"
                        ? "opacity-30 cursor-not-allowed animate-pulse bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-emerald-500/10"
                        : "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white cursor-pointer shadow-emerald-500/10 hover:shadow-emerald-500/20"
                  }`}
                  title={!permissions.billing_send_line ? (locale === "en" ? "You do not have permission to send LINE OA" : "คุณไม่มีสิทธิ์ในการส่ง LINE OA") : undefined}
                >
                  <Send className="w-4 h-4" />
                  <span>{t("billing.start_bulk_send").replace("{count}", String(connectedRooms.length))}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
      {/* Pop-up ยืนยันการหมุนเวียนครบรอบ (Rollover Confirmation Modal) */}
      {rolloverConfirm && rolloverConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all"
            onClick={() => setRolloverConfirm(null)}
          />
          {/* Modal Container */}
          <div className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl transform scale-100 transition-all ${
            isDark 
              ? "bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/50" 
              : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50"
          }`}>
            <button
              onClick={() => setRolloverConfirm(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 rounded-full animate-bounce">
                <RefreshCw className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-black tracking-tight">
                  {t("billing.rollover_confirm_title")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 px-2 leading-relaxed">
                  {t("billing.rollover_confirm_subtitle_prefix")}{" "}
                  <strong className="text-amber-500 font-extrabold">{rolloverConfirm.isBulk ? t("billing.all_rollover_rooms") : t("billing.room_label").replace("{roomNumber}", rolloverConfirm.roomNumber)}</strong>
                </p>
              </div>

              <div className={`w-full p-4 rounded-xl border text-left space-y-2 text-xs leading-relaxed ${
                isDark ? "bg-slate-950/40 border-slate-850" : "bg-amber-50/30 border-amber-100 text-amber-800"
              }`}>
                <p className="font-bold flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {t("billing.rollover_check_info_label")}
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                  <li>{t("billing.rollover_rule1")}</li>
                  <li>{t("billing.rollover_rule2")}</li>
                  <li>{t("billing.rollover_rule3")}</li>
                </ul>
              </div>

              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => setRolloverConfirm(null)}
                  className={`flex-1 h-11 text-xs font-bold rounded-xl border transition-all ${
                    isDark 
                      ? "bg-slate-950 border-slate-850 text-slate-400 hover:text-white" 
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {locale === "en" ? "Cancel" : "ยกเลิก"}
                </button>
                <button
                  onClick={() => {
                    rolloverConfirm.onConfirm();
                    setRolloverConfirm(null);
                  }}
                  className="flex-1 h-11 text-xs font-black rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
                >
                  {t("billing.confirm_rollover")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up ยืนยันการใช้งานผิดปกติเทียบค่าเฉลี่ย 3 เดือนล่าสุด (Usage Anomaly Confirmation Modal) */}
      {usageAnomalyConfirm && usageAnomalyConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all"
            onClick={() => setUsageAnomalyConfirm(null)}
          />
          {/* Modal Container */}
          <div className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl transform scale-100 transition-all ${
            isDark
              ? "bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/50"
              : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50"
          }`}>
            <button
              onClick={() => setUsageAnomalyConfirm(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-500 rounded-full">
                <AlertTriangle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black tracking-tight">
                  {t("billing.usage_anomaly_confirm_title")}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 px-2 leading-relaxed">
                  {t("billing.usage_anomaly_confirm_subtitle_prefix")}{" "}
                  <strong className="text-yellow-500 font-extrabold">
                    {usageAnomalyConfirm.isBulk
                      ? t("billing.all_anomaly_rooms")
                      : t("billing.room_label").replace("{roomNumber}", usageAnomalyConfirm.rooms[0]?.roomNumber || "")}
                  </strong>
                </p>
              </div>

              <div className={`w-full p-4 rounded-xl border text-left space-y-2 text-xs leading-relaxed max-h-52 overflow-y-auto ${
                isDark ? "bg-slate-950/40 border-slate-850" : "bg-yellow-50/30 border-yellow-100 text-yellow-800"
              }`}>
                <p className="font-bold flex items-center gap-1.5 text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {t("billing.usage_anomaly_check_info_label")}
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300">
                  {usageAnomalyConfirm.rooms.map(r => (
                    <li key={r.roomNumber}>
                      <strong className="text-yellow-600 dark:text-yellow-400">{t("billing.room_label").replace("{roomNumber}", r.roomNumber)}</strong>
                      {r.elecAbnormal && <>{" — "}{t("billing.usage_anomaly_elec_detail").replace("{units}", String(r.elecUnits)).replace("{avg}", r.elecAvg.toFixed(1))}</>}
                      {r.waterAbnormal && <>{" — "}{t("billing.usage_anomaly_water_detail").replace("{units}", String(r.waterUnits)).replace("{avg}", r.waterAvg.toFixed(1))}</>}
                    </li>
                  ))}
                  <li>{t("billing.usage_anomaly_rule")}</li>
                </ul>
              </div>

              <div className="flex w-full gap-3 pt-2">
                <button
                  onClick={() => setUsageAnomalyConfirm(null)}
                  className={`flex-1 h-11 text-xs font-bold rounded-xl border transition-all ${
                    isDark
                      ? "bg-slate-950 border-slate-850 text-slate-400 hover:text-white"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {locale === "en" ? "Cancel" : "ยกเลิก"}
                </button>
                <button
                  onClick={() => {
                    usageAnomalyConfirm.onConfirm();
                    setUsageAnomalyConfirm(null);
                  }}
                  className="flex-1 h-11 text-xs font-black rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-white shadow-lg shadow-yellow-500/20 active:scale-[0.98] transition-all"
                >
                  {t("billing.confirm_usage_anomaly")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pop-up บันทึกเปลี่ยนมิเตอร์ (กลางเดือน) */}
      {replacementModal && replacementModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-all"
            onClick={() => setReplacementModal(null)}
          />
          {/* Modal Container */}
          <div className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl transform scale-100 transition-all ${
            isDark 
              ? "bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/50" 
              : "bg-white/95 border-slate-200 text-slate-800 shadow-slate-200/50"
          }`}>
            <button
              onClick={() => setReplacementModal(null)}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 rounded-full">
                  <Wrench className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight">
                    {replacementModal.isEdit ? t("billing.edit_replacement_title") : t("billing.record_replacement_title")}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("billing.room_label").replace("{roomNumber}", replacementModal.roomNumber)} ({replacementModal.meterType === "electric" ? t("billing.elec_meter") : t("billing.water_meter_with_tap")})
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-xl border space-y-2 text-xs leading-relaxed ${
                isDark ? "bg-slate-950/40 border-slate-850" : "bg-blue-50/30 border-blue-100 text-blue-800"
              }`}>
                <p className="font-bold flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {t("billing.replacement_formula_desc")}
                </p>
                <div className="font-mono bg-white dark:bg-slate-950 p-2 rounded border border-slate-200 dark:border-slate-800/80 text-center text-xs font-black text-amber-600 dark:text-amber-400">
                  {locale === "en" ? "(Old meter - Prev) + (Current - New meter)" : "(มิเตอร์เก่า - ก่อนหน้า) + (จดรอบนี้ - มิเตอร์ใหม่)"}
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {t("billing.old_meter_final_label")}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={t("billing.example_old_meter")}
                    disabled={replacementModal.loading}
                    className={`w-full h-11 px-3.5 rounded-xl border font-mono font-bold focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-all ${
                      isDark ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                    }`}
                    value={replacementModal.oldFinalReading}
                    onChange={(e) => setReplacementModal(prev => prev ? { ...prev, oldFinalReading: e.target.value } : null)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {t("billing.new_meter_start_label")}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={t("billing.example_new_meter")}
                    disabled={replacementModal.loading}
                    className={`w-full h-11 px-3.5 rounded-xl border font-mono font-bold focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 transition-all ${
                      isDark ? "bg-slate-950 border-slate-850 text-slate-100" : "bg-white border-slate-300 text-slate-800"
                    }`}
                    value={replacementModal.newStartReading}
                    onChange={(e) => setReplacementModal(prev => prev ? { ...prev, newStartReading: e.target.value } : null)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-4">
                <div className="flex gap-3">
                  <button
                    onClick={() => setReplacementModal(null)}
                    disabled={replacementModal.loading}
                    className={`flex-1 h-11 text-xs font-bold rounded-xl border transition-all ${
                      isDark 
                        ? "bg-slate-950 border-slate-850 text-slate-400 hover:text-white" 
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    {locale === "en" ? "Cancel" : "ยกเลิก"}
                  </button>
                  <button
                    onClick={handleSaveReplacement}
                    disabled={replacementModal.loading}
                    className="flex-1 h-11 text-xs font-black rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50"
                  >
                    {replacementModal.loading ? (locale === "en" ? "Saving..." : "กำลังบันทึก...") : t("billing.save_replacement")}
                  </button>
                </div>

                {replacementModal.isEdit && (
                  <button
                    onClick={handleDeleteReplacement}
                    disabled={replacementModal.loading}
                    className="w-full h-10 mt-1 text-xs font-bold rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10 transition-all disabled:opacity-50"
                  >
                    {replacementModal.loading ? (locale === "en" ? "Deleting..." : "กำลังลบ...") : t("billing.delete_replacement")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
