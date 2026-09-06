// Render ภาพ LINE Rich Menu จากไฟล์ HTML ต้นฉบับใน docs/line-rich-menu/images/
//
// วิธีรัน:
//   node scripts/build-line-richmenu-images.mjs
//   node scripts/build-line-richmenu-images.mjs --only tenant
//   node scripts/build-line-richmenu-images.mjs --browser "C:\path\to\chrome.exe"
//
// ใช้ Chrome/Edge ที่ติดตั้งอยู่ในเครื่องถ่าย screenshot ขนาดเท่าภาพจริงเป๊ะ ๆ
// (ไม่ต้องลง dependency เพิ่ม) แล้วตรวจให้แน่ใจว่าไฟล์ที่ได้ผ่านข้อจำกัดของ LINE:
// ขนาดพิกเซลตรงกับที่ประกาศไว้ และไม่เกิน 1 MB
//
// แก้ดีไซน์ที่ไฟล์ .html แล้วรันสคริปต์นี้ใหม่ ไม่ต้องแก้ที่ .png

import fs from "fs"
import path from "path"
import os from "os"
import { execFileSync } from "child_process"

const TARGETS = [
  { key: "tenant", html: "tenant-menu.html", png: "tenant-menu.png", width: 2500, height: 1686 },
  { key: "admin", html: "admin-menu.html", png: "admin-menu.png", width: 2500, height: 1686 },
  { key: "super-admin", html: "super-admin-menu.html", png: "super-admin-menu.png", width: 2500, height: 843 }
]

// ต้นฉบับ HTML อยู่คู่กับเอกสารใน docs/ แต่ภาพที่ render ออกไปอยู่ใน public/ เพราะ Server Action
// ตอนติดตั้งเมนูต้องดึงภาพต้นแบบผ่าน URL (NEXT_PUBLIC_APP_URL + /line-richmenu/...)
const HTML_DIR = path.join("docs", "line-rich-menu", "images")
const OUT_DIR = path.join("public", "line-richmenu")
const MAX_BYTES = 1024 * 1024

const BROWSER_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
]

function fail(message) {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const values = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      values[argv[i].slice(2)] = next
      i++
    }
  }
  return values
}

function findBrowser(override) {
  if (override) {
    if (!fs.existsSync(override)) fail(`ไม่พบเบราว์เซอร์ตามที่ระบุ: ${override}`)
    return override
  }
  const found = BROWSER_CANDIDATES.find(candidate => fs.existsSync(candidate))
  if (!found) {
    fail(
      "ไม่พบ Chrome หรือ Edge ในเครื่อง — ส่ง --browser \"<path ไปยัง chrome.exe>\" มาด้วย\n" +
        "   หรือเปิดไฟล์ .html ในโฟลเดอร์ docs/line-rich-menu/images/ แล้วบันทึกภาพเองก็ได้"
    )
  }
  return found
}

/** อ่านขนาดภาพจาก PNG โดยตรง (signature 8 ไบต์ แล้ว IHDR เก็บ width/height ที่ offset 16/20) */
function readPngSize(buffer) {
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function render(browser, target) {
  const htmlPath = path.resolve(HTML_DIR, target.html)
  if (!fs.existsSync(htmlPath)) fail(`ไม่พบไฟล์ต้นฉบับ: ${htmlPath}`)

  fs.mkdirSync(path.resolve(OUT_DIR), { recursive: true })
  const outPath = path.resolve(OUT_DIR, target.png)
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "horset-richmenu-"))

  // --allow-file-access-from-files จำเป็นสำหรับโหลดฟอนต์ Prompt (.ttf) จาก path ในเครื่อง
  // ถ้าไม่ผ่าน เบราว์เซอร์จะถอยไปใช้ฟอนต์ไทยของระบบ ภาพยังใช้ได้แต่ไม่ใช่ฟอนต์แบรนด์
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--allow-file-access-from-files",
    `--user-data-dir=${profileDir}`,
    `--window-size=${target.width},${target.height}`,
    `--screenshot=${outPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`
  ]

  try {
    execFileSync(browser, args, { stdio: "pipe" })
  } catch (err) {
    fail(`เบราว์เซอร์ทำงานไม่สำเร็จตอน render ${target.html}: ${err.message}`)
  } finally {
    fs.rmSync(profileDir, { recursive: true, force: true })
  }

  if (!fs.existsSync(outPath)) fail(`เบราว์เซอร์ไม่ได้สร้างไฟล์ภาพออกมา: ${outPath}`)

  const buffer = fs.readFileSync(outPath)
  const size = readPngSize(buffer)
  const kb = (buffer.length / 1024).toFixed(0)

  if (!size) fail(`ไฟล์ที่ได้ไม่ใช่ PNG ที่อ่านได้: ${outPath}`)

  const dimOk = size.width === target.width && size.height === target.height
  const sizeOk = buffer.length <= MAX_BYTES

  console.log(`\n${dimOk && sizeOk ? "✅" : "⚠️ "} ${target.png}`)
  console.log(`   ขนาดภาพ : ${size.width}x${size.height}  ${dimOk ? "(ตรงกับที่ LINE ต้องการ)" : `❌ ต้องเป็น ${target.width}x${target.height}`}`)
  console.log(`   ขนาดไฟล์ : ${kb} KB  ${sizeOk ? "(ไม่เกิน 1 MB)" : "❌ เกินขีดจำกัด 1 MB ของ LINE"}`)

  return dimOk && sizeOk
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const browser = findBrowser(args.browser)
  const only = args.only

  const targets = only ? TARGETS.filter(t => t.key === only) : TARGETS
  if (targets.length === 0) {
    fail(`ไม่รู้จัก --only ${only} (ใช้ได้: ${TARGETS.map(t => t.key).join(", ")})`)
  }

  console.log(`\n🖼  ใช้เบราว์เซอร์: ${browser}`)

  let allOk = true
  for (const target of targets) {
    if (!render(browser, target)) allOk = false
  }

  console.log(
    allOk
      ? `\n🎉 เสร็จเรียบร้อย — ไฟล์อยู่ใน ${OUT_DIR}\n   เอาไปติดตั้งต่อด้วย scripts/install-line-richmenu.mjs --image <ไฟล์>\n`
      : "\n⚠️  มีไฟล์ที่ยังไม่ผ่านข้อกำหนดของ LINE ดูรายละเอียดด้านบน\n"
  )
  if (!allOk) process.exit(1)
}

main()
