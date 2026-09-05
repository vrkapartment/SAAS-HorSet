// ติดตั้ง LINE Rich Menu จากบรรทัดคำสั่ง
//
// ตามปกติเจ้าหอกดติดตั้งเองได้จากหน้า ตั้งค่า › LINE OA แล้ว (ดู RichMenuPanel) สคริปต์นี้เหลือไว้
// สำหรับสองงานที่หน้าเว็บทำไม่ได้:
//   1. เมนูของ LINE OA ทีมงาน HorSet (--super-admin) ซึ่งไม่ได้ผูกกับ workspace ไหน
//   2. เป็นทางออกฉุกเฉินเวลาต้องติดตั้ง/ซ่อมเมนูของหอใดหอหนึ่งจากเครื่อง dev
//
// วิธีรัน:
//   npm run line:richmenu -- --workspace <workspace_id> --image public/line-richmenu/tenant-menu.png
//   npm run line:richmenu -- --super-admin --image public/line-richmenu/super-admin-menu.png
//
// ตัวเลือกเพิ่มเติม:
//   --contact <uri>    ปุ่มติดต่อ เช่น tel:021234567 (ไม่ระบุ = ดึงจาก workspaces.tax_phone)
//   --liff-id <id>     ทับ LIFF ID ที่อ่านจาก workspace_line_settings.liff_id
//   --app-url <url>    ทับ NEXT_PUBLIC_APP_URL
//   --token <token>    ทับ channel access token ที่อ่านจากฐานข้อมูล
//   --prune            ลบ rich menu อื่นทั้งหมดของ channel นั้นหลังสลับสำเร็จ
//   --dry-run          พิมพ์ผังเมนูที่แทนค่าแล้วออกมาดู ไม่ยิง LINE API และไม่แตะฐานข้อมูล
//
// ใช้ผังเมนูและกฎตรวจภาพชุดเดียวกับหน้าเว็บ (src/features/notification/richmenu.ts)
// จึงไม่มีทางที่ CLI กับหน้าเว็บจะติดตั้งเมนูหน้าตาไม่เหมือนกัน

import fs from "fs"
import {
  buildSuperAdminRichMenu,
  buildTenantRichMenu,
  checkRichMenuImage,
  phoneToContactUri,
  SUPER_ADMIN_RICHMENU_TEMPLATE,
  TENANT_RICHMENU_TEMPLATE,
  type RichMenuDefinition
} from "../src/features/notification/richmenu"
import { DEFAULT_LIFF_ID } from "../src/lib/lineLiff"

type EnvMap = Record<string, string | undefined>

function loadEnv(): EnvMap {
  const env: EnvMap = {}
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  }
  return { ...env, ...process.env }
}

function parseArgs(argv: string[]) {
  const flags = new Set<string>()
  const values: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith("--")) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith("--")) {
      flags.add(key)
    } else {
      values[key] = next
      i++
    }
  }
  return { flags, values }
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
}

async function lineRequest(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LINE API ${init.method || "GET"} ${url} → ${res.status} ${text}`)
  }
  return text ? (JSON.parse(text) as Record<string, unknown>) : {}
}

async function main() {
  const { flags, values } = parseArgs(process.argv.slice(2))
  const env = loadEnv()

  const isSuperAdmin = flags.has("super-admin")
  const workspaceId = values.workspace || ""
  const dryRun = flags.has("dry-run")

  if (isSuperAdmin && workspaceId) fail("เลือกได้โหมดเดียว: --super-admin หรือ --workspace <id>")
  if (!isSuperAdmin && !workspaceId) fail("ต้องระบุ --workspace <workspace_id> หรือ --super-admin")

  let appUrl = (values["app-url"] || env.NEXT_PUBLIC_APP_URL || "").trim()
  while (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1)
  if (appUrl && !appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
    appUrl = `https://${appUrl}`
  }

  let channelAccessToken = values.token || ""
  let contactUri = values.contact || ""
  let liffId = values["liff-id"] || ""

  const needsDb = !channelAccessToken || (!isSuperAdmin && (!contactUri || !liffId))
  if (needsDb && !dryRun) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      fail("ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ใน .env.local")
    }

    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    if (isSuperAdmin) {
      const { data, error } = await supabase
        .from("super_admin_line_settings")
        .select("channel_access_token")
        .eq("id", 1)
        .maybeSingle()
      if (error) fail(`อ่าน super_admin_line_settings ไม่สำเร็จ: ${error.message}`)
      channelAccessToken = channelAccessToken || data?.channel_access_token || ""
    } else {
      const { data, error } = await supabase
        .from("workspace_line_settings")
        .select("channel_access_token, liff_id")
        .eq("workspace_id", workspaceId)
        .maybeSingle()
      if (error) fail(`อ่าน workspace_line_settings ไม่สำเร็จ: ${error.message}`)
      channelAccessToken = channelAccessToken || data?.channel_access_token || ""
      liffId = liffId || data?.liff_id || ""

      if (!contactUri) {
        const { data: ws, error: wsError } = await supabase
          .from("workspaces")
          .select("name, tax_phone")
          .eq("id", workspaceId)
          .maybeSingle()
        if (wsError) fail(`อ่านข้อมูลหอพักไม่สำเร็จ: ${wsError.message}`)
        contactUri = phoneToContactUri(ws?.tax_phone)
        console.log(`   หอพัก: ${ws?.name || "(ไม่มีชื่อ)"}`)
      }
    }
  }

  if (!dryRun && (!channelAccessToken || channelAccessToken === "placeholder" || !channelAccessToken.trim())) {
    fail("ไม่พบ LINE Channel Access Token ของ channel นี้ — ตั้งค่าในหน้า ตั้งค่า › LINE OA ก่อน หรือส่ง --token มาเอง")
  }

  // ---- ประกอบผังเมนู ----
  let menu: RichMenuDefinition
  if (isSuperAdmin) {
    if (!appUrl) fail("ไม่พบ NEXT_PUBLIC_APP_URL — ตั้งใน .env.local หรือส่ง --app-url มาด้วย")
    menu = buildSuperAdminRichMenu(appUrl)
  } else {
    liffId = liffId || env.NEXT_PUBLIC_LINE_DEFAULT_LIFF_ID || DEFAULT_LIFF_ID
    if (!contactUri) {
      fail(
        "เมนูมีปุ่มติดต่อเจ้าหน้าที่ แต่หอพักยังไม่ได้กรอกเบอร์โทร (workspaces.tax_phone) — " +
          "กรอกในหน้าตั้งค่า หรือส่ง --contact tel:0812345678 มาด้วย"
      )
    }
    menu = buildTenantRichMenu({ liffId, workspaceId, contactUri })
  }

  // ---- ตรวจไฟล์ภาพ ----
  const imagePath = values.image || ""
  let imageBuffer: Buffer | null = null
  let imageType: "image/png" | "image/jpeg" = "image/png"

  if (imagePath) {
    if (!fs.existsSync(imagePath)) fail(`ไม่พบไฟล์ภาพ: ${imagePath}`)
    imageBuffer = fs.readFileSync(imagePath)
    const template = isSuperAdmin ? SUPER_ADMIN_RICHMENU_TEMPLATE : TENANT_RICHMENU_TEMPLATE
    const check = checkRichMenuImage(imageBuffer, template)
    if (!check.ok) fail(check.error)
    imageType = check.type
  } else if (!dryRun) {
    fail("ต้องระบุ --image path/to/menu.png (LINE บังคับให้อัปโหลดภาพก่อนใช้เมนูได้)")
  }

  console.log(`\n📋 เมนู: ${menu.name}  (${menu.size.width}x${menu.size.height}, ${menu.areas.length} ปุ่ม)`)
  for (const area of menu.areas) {
    const action = area.action
    const detail = action.type === "uri" ? action.uri : action.text || action.data || ""
    console.log(`   • ${action.label} → [${action.type}] ${detail}`)
  }

  if (dryRun) {
    console.log("\n🧪 --dry-run: ไม่ได้ยิง LINE API\n")
    console.log(JSON.stringify(menu, null, 2))
    return
  }

  // ---- 1) สร้างเมนู ----
  const created = await lineRequest("https://api.line.me/v2/bot/richmenu", channelAccessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(menu)
  })
  const richMenuId = typeof created.richMenuId === "string" ? created.richMenuId : ""
  if (!richMenuId) fail(`LINE ไม่ได้คืน richMenuId กลับมา: ${JSON.stringify(created)}`)
  console.log(`\n✅ สร้างเมนูแล้ว: ${richMenuId}`)

  // ---- 2) อัปโหลดภาพ ----
  await lineRequest(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, channelAccessToken, {
    method: "POST",
    headers: { "Content-Type": imageType },
    body: new Uint8Array(imageBuffer!)
  })
  console.log(`✅ อัปโหลดภาพแล้ว: ${imagePath}`)

  // ---- 3) ตั้งเป็นเมนูเริ่มต้นของทุกคนใน channel ----
  await lineRequest(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, channelAccessToken, {
    method: "POST"
  })
  console.log("✅ ตั้งเป็นเมนูเริ่มต้นของผู้ติดตามทุกคนแล้ว")

  // ---- 4) ลบเมนูเก่า (เมื่อสั่ง --prune) ----
  if (flags.has("prune")) {
    const list = await lineRequest("https://api.line.me/v2/bot/richmenu/list", channelAccessToken)
    const menus = Array.isArray(list.richmenus) ? (list.richmenus as { richMenuId: string; name: string }[]) : []
    const stale = menus.filter(m => m.richMenuId !== richMenuId)
    for (const old of stale) {
      await lineRequest(`https://api.line.me/v2/bot/richmenu/${old.richMenuId}`, channelAccessToken, {
        method: "DELETE"
      })
      console.log(`🗑  ลบเมนูเก่า: ${old.richMenuId} (${old.name})`)
    }
    if (stale.length === 0) console.log("   ไม่มีเมนูเก่าค้างอยู่")
  }

  if (!isSuperAdmin) {
    console.log(
      "\n⚠️  สคริปต์นี้ไม่ได้บันทึกสถานะลง workspace_line_settings — หน้าตั้งค่าจะยังแสดงว่า" +
        "\n   \"ยังไม่ได้ติดตั้ง\" กดปุ่มอัปเดตในหน้าเว็บอีกครั้งเพื่อให้ระบบจำสถานะและเวลาอัปเดตล่าสุด"
    )
  }

  console.log("\n🎉 เสร็จเรียบร้อย — เปิดแชท LINE OA แล้วลองกดปุ่มในเมนูดูได้เลย\n")
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n❌ ${message}\n`)
  process.exit(1)
})
