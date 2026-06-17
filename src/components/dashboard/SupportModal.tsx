"use client"

import React from "react"
import { Lock } from "lucide-react"

interface SupportModalProps {
  isOpen: boolean
  workspaceName: string
  onDecide: (approved: boolean) => void
}

export default function SupportModal({
  isOpen,
  workspaceName,
  onDecide
}: SupportModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />
      
      <div className="relative glass-panel w-full max-w-md p-8 rounded-3xl border border-blue-500/20 shadow-2xl shadow-blue-500/5 animate-scale-up">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-indigo-500 rounded-t-3xl" />
        
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 text-blue-400">
            <Lock className="w-8 h-8" />
          </div>
          
          <h3 className="text-xl font-bold text-slate-100">
            🔔 คำขอช่วยเหลือระบบ (Support Request)
          </h3>
          
          <p className="text-sm text-slate-400 leading-relaxed">
            เจ้าหน้าที่บริการลูกค้า <span className="text-blue-400 font-semibold">(Super Admin)</span> ร้องขอเชื่อมต่อสิทธิ์เพื่อตรวจสอบข้อมูลในหอพัก <span className="text-white font-medium">"{workspaceName}"</span> ของคุณชั่วคราว เพื่อความปลอดภัยสูงสุด โปรดยืนยันการให้สิทธิ์เข้าถึงนี้
          </p>

          <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 text-left w-full space-y-2 text-xs text-slate-400">
            <div className="flex justify-between">
              <span>ผู้ร้องขอ:</span>
              <span className="text-slate-200 font-medium">HorSet Support Team (Super Admin)</span>
            </div>
            <div className="flex justify-between">
              <span>ขอบเขตข้อมูล:</span>
              <span className="text-slate-200 font-medium">อ่านและแก้ไขห้องพัก, สัญญา, มิเตอร์ และบิล</span>
            </div>
            <div className="flex justify-between">
              <span>ความปลอดภัย:</span>
              <span className="text-teal-400 font-semibold">คุณสามารถเพิกถอนสิทธิ์การเข้าถึงได้ตลอดเวลา</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full mt-4">
            <button
              onClick={() => onDecide(false)}
              className="py-3 px-4 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
            >
              ปฏิเสธ (Deny)
            </button>
            <button
              onClick={() => onDecide(true)}
              className="py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
            >
              อนุมัติสิทธิ์ (Approve)
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
