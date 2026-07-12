// ตั้งค่า pdfjs-dist ให้รันฝั่ง browser เท่านั้น (ห้าม import ไฟล์นี้จาก server component/route handler)
// ใช้สำหรับเรนเดอร์หน้า PDF เป็นภาพในหน้า Visual Field Mapping ของ Super Admin เท่านั้น
// ไม่ใช้ native `canvas` package เพราะเปราะบางบน Vercel serverless — เรนเดอร์ผ่าน Canvas API ของ browser เอง
"use client"

import * as pdfjsLib from "pdfjs-dist"

let workerConfigured = false

function ensureWorkerConfigured() {
  if (workerConfigured) return
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString()
  workerConfigured = true
}

export async function loadPdfDocument(data: ArrayBuffer | Uint8Array) {
  ensureWorkerConfigured()
  const loadingTask = pdfjsLib.getDocument({ data })
  return loadingTask.promise
}

export type PdfJsPageProxy = Awaited<ReturnType<Awaited<ReturnType<typeof loadPdfDocument>>["getPage"]>>
