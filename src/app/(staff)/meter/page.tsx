"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import { Gauge, Save, AlertCircle, Check, Play } from "lucide-react"

interface MeterRecordItem {
  id: string
  roomNumber: string
  tenantName: string
  elecPrev: number
  elecCurr: string | number
  waterPrev: number
  waterCurr: string | number
  isSaved: boolean
}

export default function MeterPage() {
  const [billingCycle, setBillingCycle] = useState("2026-06")

  const initialRecords: MeterRecordItem[] = [
    { id: "1", roomNumber: "101", tenantName: "คุณวิภาวี สมบูรณ์", elecPrev: 1042, elecCurr: 1102, waterPrev: 342, waterCurr: 351, isSaved: true },
    { id: "2", roomNumber: "102", tenantName: "คุณนพดล สุขศรี", elecPrev: 2314, elecCurr: 2410, waterPrev: 512, waterCurr: 524, isSaved: true },
    { id: "3", roomNumber: "103", tenantName: "คุณวรรณภา ใสดี", elecPrev: 1590, elecCurr: 1675, waterPrev: 423, waterCurr: 435, isSaved: true },
    { id: "4", roomNumber: "105", tenantName: "คุณณัฐพล ใจดี", elecPrev: 874, elecCurr: "", waterPrev: 189, waterCurr: "", isSaved: false },
    { id: "5", roomNumber: "201", tenantName: "คุณอรทัย มั่นคง", elecPrev: 3120, elecCurr: "", waterPrev: 755, waterCurr: "", isSaved: false },
    { id: "6", roomNumber: "202", tenantName: "คุณสุชาติ เลิศรส", elecPrev: 1845, elecCurr: 1912, waterPrev: 399, waterCurr: 408, isSaved: true }
  ]
  
  // สเตตจำลองรายการบันทึกมิเตอร์ในรอบบิลปัจจุบัน
  const [records, setRecords] = useState<MeterRecordItem[]>(initialRecords)

  // โหลดและบันทึกข้อมูลมิเตอร์จาก localStorage ตามรอบบิล
  useEffect(() => {
    const key = `horset_meter_records_${billingCycle}`
    const savedRecords = localStorage.getItem(key)
    if (savedRecords) {
      try {
        setRecords(JSON.parse(savedRecords))
      } catch (e) {
        console.error("Failed to parse meter records from localStorage", e)
      }
    } else {
      // ดึงข้อมูลห้องจาก localStorage มาสร้างรายการบันทึก
      const savedRooms = localStorage.getItem("horset_rooms")
      if (savedRooms) {
        try {
          const rooms = JSON.parse(savedRooms)
          const occupiedRooms = rooms.filter((r: any) => r.status === "occupied")
          if (occupiedRooms.length > 0) {
            const generatedRecords: MeterRecordItem[] = occupiedRooms.map((r: any, idx: number) => {
              // พยายามหาค่าย้อนหลังของห้องเดิมในรอบบิลอื่น หรือสุ่มเลขขึ้นมาเป็นค่าเริ่มต้น
              return {
                id: r.id || String(idx + 1),
                roomNumber: r.roomNumber,
                tenantName: r.tenantName || "ผู้เช่า",
                elecPrev: 1000 + Math.floor(Math.random() * 2000),
                elecCurr: "",
                waterPrev: 100 + Math.floor(Math.random() * 500),
                waterCurr: "",
                isSaved: false
              }
            })
            setRecords(generatedRecords)
            localStorage.setItem(key, JSON.stringify(generatedRecords))
            return
          }
        } catch (e) {
          console.error(e)
        }
      }

      setRecords(initialRecords)
      localStorage.setItem(key, JSON.stringify(initialRecords))
    }
  }, [billingCycle])

  const updateRecords = (newRecords: MeterRecordItem[]) => {
    setRecords(newRecords)
    localStorage.setItem(`horset_meter_records_${billingCycle}`, JSON.stringify(newRecords))
  }

  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // เปลี่ยนแปลงค่ามิเตอร์ไฟฟ้า
  const handleElecChange = (id: string, value: string) => {
    const updated = records.map(rec => {
      if (rec.id === id) {
        return { ...rec, elecCurr: value, isSaved: false }
      }
      return rec
    })
    updateRecords(updated)
  }

  // เปลี่ยนแปลงค่าน้ำประปา
  const handleWaterChange = (id: string, value: string) => {
    const updated = records.map(rec => {
      if (rec.id === id) {
        return { ...rec, waterCurr: value, isSaved: false }
      }
      return rec
    })
    updateRecords(updated)
  }

  // บันทึกเฉพาะแถว
  const handleSaveRow = (id: string) => {
    const record = records.find(r => r.id === id)
    if (!record) return

    const elecVal = Number(record.elecCurr)
    const waterVal = Number(record.waterCurr)

    if (isNaN(elecVal) || record.elecCurr === "" || isNaN(waterVal) || record.waterCurr === "") {
      alert("กรุณากรอกตัวเลขมิเตอร์ไฟฟ้าและค่าน้ำประปาให้ถูกต้อง")
      return
    }

    if (elecVal < record.elecPrev || waterVal < record.waterPrev) {
      alert("⚠️ ตัวเลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่ามิเตอร์ครั้งก่อนหน้า")
      return
    }

    const updated = records.map(rec => {
      if (rec.id === id) {
        return { ...rec, elecCurr: elecVal, waterCurr: waterVal, isSaved: true }
      }
      return rec
    })
    updateRecords(updated)

    showToast(`บันทึกมิเตอร์ห้อง ${record.roomNumber} เรียบร้อยแล้ว`)
  }

  // บันทึกทั้งหมด
  const handleSaveAll = () => {
    // กรองตรวจสอบความถูกต้อง
    const hasError = records.some(rec => {
      const eVal = Number(rec.elecCurr)
      const wVal = Number(rec.waterCurr)
      return rec.elecCurr === "" || rec.waterCurr === "" || isNaN(eVal) || isNaN(wVal) || eVal < rec.elecPrev || wVal < rec.waterPrev
    })

    if (hasError) {
      alert("ไม่สามารถบันทึกได้ เนื่องจากบางห้องข้อมูลไม่ครบถ้วน หรือมิเตอร์ปัจจุบันน้อยกว่าครั้งก่อน")
      return
    }

    const updated = records.map(rec => ({
      ...rec,
      elecCurr: Number(rec.elecCurr),
      waterCurr: Number(rec.waterCurr),
      isSaved: true
    }))
    updateRecords(updated)

    showToast("บันทึกค่ามิเตอร์ของทุกห้องในระบบเรียบร้อยแล้ว!")
  }

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  return (
    <DashboardLayout role="staff">
      {/* Toast แจ้งเตือน */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 glass-panel border border-teal-500/30 text-teal-400 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-slide-up text-xs font-semibold">
          <Check className="w-4 h-4 text-teal-400" /> {toastMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 font-sans">บันทึกเลขมิเตอร์ไฟ/น้ำ</h2>
          <p className="text-sm text-slate-400 mt-1">บันทึกตัวเลขการใช้สอยน้ำประปาและกระแสไฟฟ้าประจำห้องพักเพื่อประมวลผลบิล</p>
        </div>
        <div className="flex gap-3">
          {/* เลือกรอบบิล */}
          <select
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl focus:outline-none text-slate-200 text-sm font-semibold"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            <option value="2026-06">รอบบิล มิถุนายน 2026</option>
            <option value="2026-05">รอบบิล พฤษภาคม 2026</option>
          </select>

          <button
            onClick={handleSaveAll}
            className="glow-btn bg-teal-600 hover:bg-teal-500 text-white font-medium py-2.5 px-5 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-teal-600/10"
          >
            <Save className="w-4 h-4" /> บันทึกทั้งหมด
          </button>
        </div>
      </div>

      {/* กล่องแจ้งเตือนข้อมูล */}
      <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-sm text-amber-400">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>โปรดตรวจสอบให้มั่นใจว่าเลขมิเตอร์ปัจจุบันที่กรอก มีค่ามากกว่าเลขมิเตอร์รอบก่อนหน้านั้นเสมอ</span>
      </div>

      {/* รายการห้องที่ต้องบันทึกมิเตอร์ */}
      <div className="glass-card rounded-2xl border border-slate-900/60 p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-900 text-slate-400 font-bold text-xs uppercase tracking-wider">
                <th className="pb-3 pl-2">ห้อง</th>
                <th className="pb-3">ผู้เช่า</th>
                <th className="pb-3 text-center bg-blue-500/5 rounded-t-lg">ไฟครั้งก่อน</th>
                <th className="pb-3 text-center bg-blue-500/5">ไฟปัจจุบัน</th>
                <th className="pb-3 text-center bg-blue-500/5">หน่วยที่ใช้ (ไฟ)</th>
                <th className="pb-3 text-center bg-teal-500/5 rounded-t-lg">น้ำครั้งก่อน</th>
                <th className="pb-3 text-center bg-teal-500/5">น้ำปัจจุบัน</th>
                <th className="pb-3 text-center bg-teal-500/5">หน่วยที่ใช้ (น้ำ)</th>
                <th className="pb-3 text-center">สถานะ</th>
                <th className="pb-3 text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/40">
              {records.map((rec) => {
                const elecUnits = rec.elecCurr !== "" ? Number(rec.elecCurr) - rec.elecPrev : 0
                const waterUnits = rec.waterCurr !== "" ? Number(rec.waterCurr) - rec.waterPrev : 0

                return (
                  <tr key={rec.id} className="hover:bg-slate-900/10">
                    <td className="py-4 pl-2 font-bold text-slate-100 text-base">{rec.roomNumber}</td>
                    <td className="py-4 text-slate-300 text-sm">{rec.tenantName}</td>
                    
                    {/* มิเตอร์ไฟฟ้า */}
                    <td className="py-4 text-center font-mono text-slate-300 text-sm bg-blue-500/5">{rec.elecPrev}</td>
                    <td className="py-4 text-center bg-blue-500/5 px-2">
                      <input
                        type="text"
                        placeholder="กรอกเลข"
                        className="w-24 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:border-blue-500"
                        value={rec.elecCurr}
                        onChange={(e) => handleElecChange(rec.id, e.target.value)}
                      />
                    </td>
                    <td className="py-4 text-center font-mono font-bold text-blue-400 text-base bg-blue-500/5">
                      {elecUnits >= 0 ? elecUnits : <span className="text-red-400">ผิดพลาด</span>}
                    </td>

                    {/* มิเตอร์น้ำประปา */}
                    <td className="py-4 text-center font-mono text-slate-300 text-sm bg-teal-500/5">{rec.waterPrev}</td>
                    <td className="py-4 text-center bg-teal-500/5 px-2">
                      <input
                        type="text"
                        placeholder="กรอกเลข"
                        className="w-24 text-center py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono text-sm focus:outline-none focus:border-teal-500"
                        value={rec.waterCurr}
                        onChange={(e) => handleWaterChange(rec.id, e.target.value)}
                      />
                    </td>
                    <td className="py-4 text-center font-mono font-bold text-teal-400 text-base bg-teal-500/5">
                      {waterUnits >= 0 ? waterUnits : <span className="text-red-400">ผิดพลาด</span>}
                    </td>

                    {/* สถานะการบันทึก */}
                    <td className="py-4 text-center">
                      <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        rec.isSaved ? "bg-teal-500/10 text-teal-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {rec.isSaved ? "บันทึกแล้ว" : "แก้ไขอยู่"}
                      </span>
                    </td>

                    {/* ปุ่มบันทึกแถว */}
                    <td className="py-4 text-center">
                      <button
                        onClick={() => handleSaveRow(rec.id)}
                        disabled={rec.isSaved}
                        className={`p-2 rounded-lg border text-sm transition-all ${
                          rec.isSaved
                            ? "border-slate-800 text-slate-600 cursor-not-allowed"
                            : "border-teal-500/40 text-teal-400 hover:bg-teal-500 hover:text-white"
                        }`}
                      >
                        <Save className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
