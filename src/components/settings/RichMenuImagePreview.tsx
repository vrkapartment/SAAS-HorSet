"use client"

import React, { useCallback, useEffect, useState } from "react"
import { Maximize2, X } from "lucide-react"

/**
 * ภาพตัวอย่างเมนู LINE แบบย่อ กดเพื่อดูเต็มจอ
 *
 * ภาพเมนูเป็นสัดส่วน 2500x1686 ถ้าปล่อยกว้างเต็มการ์ดจะสูงเกือบ 400px และในหน้านี้มี
 * 2 ภาพ (เมนูผู้เช่า + เมนูผู้ดูแล) ทำให้ต้องเลื่อนจอยาวมากกว่าจะถึงปุ่มที่ต้องกดจริง
 * จึงย่อลงเป็นภาพตัวอย่างแล้วเปิดเต็มจอเมื่อต้องการดูรายละเอียดปุ่ม
 *
 * ใช้ร่วมกันทั้งสองภาพ เพื่อให้ lightbox มีที่มาที่เดียว ไม่ต้องเขียนซ้ำ
 */

type Props = {
  src: string
  alt: string
  /** ข้อความบอกว่ากดได้ (แสดงตอน hover บนจอใหญ่ และแสดงค้างบนมือถือที่ไม่มี hover) */
  hint: string
  closeLabel: string
}

export default function RichMenuImagePreview({ src, alt, hint, closeLabel }: Props) {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  // ปิดด้วย Esc และล็อกการเลื่อนหน้าเบื้องหลังไว้ ไม่ให้เลื่อนหลุดตอนดูภาพเต็มจอ
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("keydown", onKeyDown)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, close])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={hint}
        className="group relative block w-full max-w-xs overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 transition-colors hover:border-indigo-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="block w-full" />

        {/* ไอคอนขยายมุมขวาบน — มีพื้นทึบรองเพื่อให้เห็นชัดบนภาพเมนูที่พื้นขาว */}
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-slate-900/75 px-2 py-1 text-[10px] font-black text-white">
          <Maximize2 className="h-3 w-3" />
          <span className="hidden sm:inline">{hint}</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4 sm:p-8"
        >
          <button
            type="button"
            onClick={close}
            aria-label={closeLabel}
            className="absolute top-4 right-4 rounded-xl bg-white/10 p-2.5 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>

          {/* กันคลิกบนภาพไม่ให้ทะลุไปโดน backdrop แล้วปิดเอง */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            onClick={e => e.stopPropagation()}
            className="max-h-full max-w-full rounded-xl bg-white object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  )
}
