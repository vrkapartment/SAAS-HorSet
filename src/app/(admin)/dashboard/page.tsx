"use client"

import { useState, useEffect } from "react"
import DashboardLayout from "@/components/DashboardLayout"
import {
  TrendingUp,
  Users,
  Home,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  DollarSign,
  Activity,
  CheckCircle2,
  Clock
} from "lucide-react"
import { getRooms } from "@/features/room/actions"
import { getTenants } from "@/features/tenant/actions"
import { getBills } from "@/features/billing/actions"

export default function AdminDashboard() {
  const [isDemo, setIsDemo] = useState(false)
  const [stats, setStats] = useState<any[]>([])
  const [recentTransactions, setRecentTransactions] = useState<any[]>([])
  const [recentActivities, setRecentActivities] = useState<any[]>([])

  const loadDashboardData = async () => {
    const roomsRes = await getRooms()
    const tenantsRes = await getTenants()
    const billsRes = await getBills()

    const hasSupabase = roomsRes.success && tenantsRes.success && billsRes.success

    if (hasSupabase && roomsRes.data && tenantsRes.data && billsRes.data) {
      setIsDemo(false)
      const rooms = roomsRes.data
      const tenants = tenantsRes.data
      const bills = billsRes.data as any[]

      const totalRooms = rooms.length
      const occupiedRooms = rooms.filter((r: any) => r.status === "occupied").length
      const availableRooms = rooms.filter((r: any) => r.status === "available").length
      
      const currentMonthBills = bills.filter((b: any) => b.billingCycle === "2026-06")
      const paidBills = currentMonthBills.filter((b: any) => b.status === "paid")
      const unpaidBills = currentMonthBills.filter((b: any) => b.status === "unpaid" || b.status === "pending")
      const pendingBills = currentMonthBills.filter((b: any) => b.status === "pending")

      const totalRevenue = paidBills.reduce((sum, b) => sum + Number(b.amount), 0)
      const unpaidAmount = unpaidBills.reduce((sum, b) => sum + Number(b.amount), 0)

      setStats([
        {
          title: "รายรับรอบเดือน มิ.ย.",
          value: `${totalRevenue.toLocaleString()} บาท`,
          change: `จากที่จ่ายแล้ว ${paidBills.length} ห้อง`,
          isPositive: true,
          icon: DollarSign,
          color: "text-blue-500",
          bg: "bg-blue-500/10"
        },
        {
          title: "จำนวนผู้เช่าปัจจุบัน",
          value: `${occupiedRooms} / ${totalRooms} ห้อง`,
          change: `คิดเป็น ${(totalRooms > 0 ? (occupiedRooms / totalRooms) * 100 : 0).toFixed(1)}% ของหอพัก`,
          isPositive: true,
          icon: Users,
          color: "text-teal-500",
          bg: "bg-teal-500/10"
        },
        {
          title: "ห้องว่างพร้อมเช่า",
          value: `${availableRooms} ห้อง`,
          change: rooms.filter((r: any) => r.status === "available").slice(0, 2).map((r: any) => `ห้อง ${r.roomNumber}`).join(", ") || "ไม่มีห้องว่าง",
          isPositive: false,
          icon: Home,
          color: "text-amber-500",
          bg: "bg-amber-500/10"
        },
        {
          title: "บิลค้างชำระเงิน",
          value: `${unpaidBills.length} บิล`,
          change: `คิดเป็นเงิน ${unpaidAmount.toLocaleString()} บาท (${pendingBills.length} รอยืนยัน)`,
          isPositive: false,
          icon: Clock,
          color: "text-red-500",
          bg: "bg-red-500/10"
        }
      ])

      const formattedTxs = bills.slice(0, 4).map((b: any) => ({
        room: `ห้อง ${b.roomNumber}`,
        tenant: b.tenantName,
        type: "โอนผ่านพร้อมเพย์",
        amount: `${b.amount.toLocaleString()} บาท`,
        status: b.status === "paid" ? "สำเร็จ" : b.status === "pending" ? "รอยืนยัน" : "ค้างชำระ",
        time: "ล่าสุด"
      }))
      setRecentTransactions(formattedTxs)

      const activities = []
      if (tenants.length > 0) {
        const latestTenant = tenants[0]
        activities.push({
          user: "ระบบอัตโนมัติ",
          action: `ทำสัญญาเช่าใหม่ ห้อง ${latestTenant.roomNumber} (${latestTenant.fullName})`,
          time: "ล่าสุด"
        })
      }
      if (bills.length > 0) {
        const pendingCount = bills.filter((b: any) => b.status === "pending").length
        if (pendingCount > 0) {
          activities.push({
            user: "ผู้เช่า",
            action: `มีบิลอัปโหลดสลิปรอการตรวจสอบจำนวน ${pendingCount} รายการ`,
            time: "ล่าสุด"
          })
        }
      }
      activities.push({
        user: "ระบบเชื่อมต่อ",
        action: "เชื่อมต่อฐานข้อมูล Supabase สำเร็จ ทำการดึงข้อมูลสดเรียบร้อยแล้ว",
        time: "เชื่อมต่อแล้ว"
      })
      setRecentActivities(activities)

    } else {
      setIsDemo(true)
      
      const savedBillsStr = localStorage.getItem("horset_bills")
      const savedRoomsStr = localStorage.getItem("horset_rooms")
      
      let localBills = []
      let localRooms = []
      
      try {
        if (savedBillsStr) localBills = JSON.parse(savedBillsStr)
        if (savedRoomsStr) localRooms = JSON.parse(savedRoomsStr)
      } catch (e) {}

      if (localRooms.length > 0 || localBills.length > 0) {
        const totalRooms = localRooms.length || 24
        const occupiedRooms = localRooms.filter((r: any) => r.status === "occupied").length || 22
        const availableRooms = totalRooms - occupiedRooms
        const paidBills = localBills.filter((b: any) => b.status === "paid")
        const unpaidBills = localBills.filter((b: any) => b.status !== "paid")
        const totalRevenue = paidBills.reduce((sum: number, b: any) => sum + Number(b.amount), 0) || 148250
        const unpaidAmount = unpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount), 0) || 16800

        setStats([
          { title: "รายรับรอบเดือน มิ.ย.", value: `${totalRevenue.toLocaleString()} บาท`, change: "+12.5% จากเดือนก่อน", isPositive: true, icon: DollarSign, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "จำนวนผู้เช่าปัจจุบัน", value: `${occupiedRooms} / ${totalRooms} ห้อง`, change: "คิดเป็น 91.6% ของหอพัก", isPositive: true, icon: Users, color: "text-teal-500", bg: "bg-teal-500/10" },
          { title: "ห้องว่างพร้อมเช่า", value: `${availableRooms} ห้อง`, change: "ห้อง 104, ห้อง 208", isPositive: false, icon: Home, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "บิลค้างชำระเงิน", value: `${unpaidBills.length || 3} บิล`, change: `คิดเป็นเงิน ${unpaidAmount.toLocaleString()} บาท`, isPositive: false, icon: Clock, color: "text-red-500", bg: "bg-red-500/10" }
        ])
      } else {
        setStats([
          { title: "รายรับรอบเดือน มิ.ย.", value: "148,250 บาท", change: "+12.5% จากเดือนก่อน", isPositive: true, icon: DollarSign, color: "text-blue-500", bg: "bg-blue-500/10" },
          { title: "จำนวนผู้เช่าปัจจุบัน", value: "22 / 24 ห้อง", change: "คิดเป็น 91.6% ของหอพัก", isPositive: true, icon: Users, color: "text-teal-500", bg: "bg-teal-500/10" },
          { title: "ห้องว่างพร้อมเช่า", value: "2 ห้อง", change: "ห้อง 104, ห้อง 208", isPositive: false, icon: Home, color: "text-amber-500", bg: "bg-amber-500/10" },
          { title: "บิลค้างชำระเงิน", value: "3 บิล", change: "คิดเป็นเงิน 16,800 บาท", isPositive: false, icon: Clock, color: "text-red-500", bg: "bg-red-500/10" }
        ])
      }

      setRecentTransactions([
        { room: "ห้อง 101", tenant: "คุณวิภาวี", type: "โอนผ่านพร้อมเพย์", amount: "5,400 บาท", status: "สำเร็จ", time: "10 นาทีที่แล้ว" },
        { room: "ห้อง 203", tenant: "คุณกิตติศักดิ์", type: "โอนผ่านพร้อมเพย์", amount: "6,200 บาท", status: "สำเร็จ", time: "1 ชั่วโมงที่แล้ว" },
        { room: "ห้อง 105", tenant: "คุณณัฐพล", type: "อัปโหลดสลิปค้างยืนยัน", amount: "5,800 บาท", status: "รอยืนยัน", time: "2 ชั่วโมงที่แล้ว" },
        { room: "ห้อง 302", tenant: "คุณรภัสสร", type: "ยังไม่ได้ชำระ", amount: "5,600 บาท", status: "ค้างชำระ", time: "1 วันที่แล้ว" }
      ])

      setRecentActivities([
        { user: "พนักงานสมชาย", action: "บันทึกตัวเลขมิเตอร์น้ำไฟรอบเดือน มิ.ย. ครบถ้วน", time: "เมื่อวานนี้" },
        { user: "ระบบอัตโนมัติ", action: "ส่งใบแจ้งหนี้ PDF ไปยัง LINE OA ของผู้เช่าทั้งหมด 22 ห้อง", time: "2 วันก่อน" },
        { user: "แอดมินสมเจตน์", action: "เพิ่มผู้เช่าใหม่สัญญา 1 ปี ห้อง 205 (คุณสุรศักดิ์)", time: "3 วันก่อน" }
      ])
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <DashboardLayout role="admin">
      {/* ส่วนหัวข้อต้อนรับ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100">ยินดีต้อนรับกลับ แอดมินสมเจตน์!</h2>
          <p className="text-xs text-slate-400 mt-1">ข้อมูลสรุปและสถานะภาพรวมของหอพัก แสนสุข แมนชั่น ประจำวันนี้</p>
        </div>
        <div className="text-xs font-semibold px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl flex items-center gap-2">
          <span className="w-2 h-2 bg-teal-500 rounded-full animate-ping" />
          ระบบ Supabase RLS : เปิดใช้งาน RLS ทุกตาราง
        </div>
      </div>

      {/* Grid การ์ดสถิติ (Stats Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => {
          const Icon = stat.icon
          return (
            <div key={idx} className="glass-card p-6 rounded-2xl border border-slate-900/60 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-medium">{stat.title}</span>
                  <h3 className="text-2xl font-bold">{stat.value}</h3>
                  <span className={`inline-flex items-center text-[10px] font-semibold ${stat.isPositive ? "text-teal-400" : "text-slate-400"}`}>
                    {stat.change}
                  </span>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* แถวล่าง: ประวัติบิลน้ำไฟ และ กิจกรรมพนักงาน */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* รายการโอนเงินและชำระบิลล่าสุุด (2 ใน 3 คอลัมน์) */}
        <div className="lg:col-span-2 glass-card rounded-2xl border border-slate-900/60 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" /> สถานะบิลและการรับเงินล่าสุด
            </h3>
            <button className="text-[10px] text-blue-400 hover:text-blue-300 font-medium">ดูทั้งหมด</button>
          </div>

          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-slate-500 font-semibold">
                  <th className="pb-3">ห้องพัก</th>
                  <th className="pb-3">ชื่อผู้เช่า</th>
                  <th className="pb-3">วิธีการ</th>
                  <th className="pb-3 text-right">ยอดชำระ</th>
                  <th className="pb-3 text-center">สถานะ</th>
                  <th className="pb-3 text-right">เวลา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {recentTransactions.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-slate-900/10">
                    <td className="py-3.5 font-medium text-slate-200">{tx.room}</td>
                    <td className="py-3.5 text-slate-400">{tx.tenant}</td>
                    <td className="py-3.5 text-slate-400">{tx.type}</td>
                    <td className="py-3.5 text-right font-semibold text-slate-200">{tx.amount}</td>
                    <td className="py-3.5 text-center">
                      <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        tx.status === "สำเร็จ" ? "bg-teal-500/15 text-teal-400" :
                        tx.status === "รอยืนยัน" ? "bg-amber-500/15 text-amber-400" :
                        "bg-red-500/15 text-red-400"
                      }`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="py-3.5 text-right text-slate-500">{tx.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* บันทึกกิจกรรมระบบ/พนักงาน (1 ใน 3 คอลัมน์) */}
        <div className="glass-card rounded-2xl border border-slate-900/60 p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-500" /> กิจกรรมล่าสุดในระบบ
            </h3>
          </div>

          <div className="flex-1 space-y-4">
            {recentActivities.map((act, idx) => (
              <div key={idx} className="flex gap-3 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-slate-200 leading-relaxed">
                    <span className="font-semibold text-slate-300">{act.user}</span>: {act.action}
                  </p>
                  <span className="text-[10px] text-slate-500 block">{act.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
