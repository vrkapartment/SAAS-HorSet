import { NextRequest, NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import crypto from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  SLIP_ARM_POSTBACK,
  armSlipUpload,
  handleSlipBillChoice,
  handleSlipImage,
  handleSlipRoomChoice,
  type LineTextMessage
} from "@/features/notification/line-slip"

// Helper function to verify signature from LINE Webhook
function verifySignature(body: string, channelSecret: string, signature: string): boolean {
  if (!channelSecret || !signature) return false
  const hash = crypto
    .createHmac("sha256", channelSecret)
    .update(body)
    .digest("base64")
  return hash === signature
}

// System client with bypass RLS since Webhook operates on server-to-server calls
function getSystemClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    }
  })
}


/** เท่าที่ตัวจัดการสลิปใช้จาก event ที่ LINE ส่งมา (webhook รับ event ได้หลายชนิด) */
type LineSlipEvent = {
  type?: string
  replyToken?: string
  source?: { type?: string; userId?: string }
  message?: { type?: string; id?: string }
  postback?: { data?: string }
}

/** ตอบกลับผู้ใช้ด้วย replyToken (ฟรี ไม่กินโควตาเหมือน push) */
async function replyToLine(replyToken: string, messages: LineTextMessage[], token: string) {
  if (!replyToken || messages.length === 0) return
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ replyToken, messages })
    })
  } catch (err) {
    console.error("line-slip: ตอบกลับ LINE ไม่สำเร็จ:", err)
  }
}

/**
 * จัดการ event ที่เกี่ยวกับการส่งสลิปในแชท
 *
 * คืน true เมื่อจัดการ event นี้ไปแล้ว เพื่อให้ webhook ข้ามตัวจัดการอื่นที่เหลือ
 */
async function handleLineSlipEvent(args: {
  supabase: SupabaseClient
  workspaceId: string
  channelAccessToken: string
  event: LineSlipEvent
}): Promise<boolean> {
  const { supabase, workspaceId, channelAccessToken, event } = args
  const lineUserId: string = event.source?.userId || ""
  if (!lineUserId) return false

  // แอดมินที่ผูก LINE ไว้รับแจ้งเตือนสลิปอยู่ใน OA เดียวกับผู้เช่า — รูปของแอดมินไม่ใช่สลิป
  const { data: lineSettings } = await supabase
    .from("workspace_line_settings")
    .select("admin_line_user_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle()
  const adminIds = (lineSettings?.admin_line_user_id || "")
    .split(/[\s,\n]+/)
    .map((id: string) => id.trim())
    .filter((id: string) => id.length > 0)
  if (adminIds.includes(lineUserId)) return false

  let appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim()
  while (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1)
  if (appUrl && !appUrl.startsWith("http")) appUrl = `https://${appUrl}`

  const ctx = { db: supabase, workspaceId, lineUserId, channelAccessToken, appUrl }

  try {
    if (event.type === "postback") {
      const data: string = event.postback?.data || ""
      if (data === SLIP_ARM_POSTBACK) {
        await replyToLine(event.replyToken || "", await armSlipUpload(ctx), channelAccessToken)
        return true
      }
      // ผู้เช่าหลายห้องต้องผ่านสองขั้น: เลือกห้องก่อน แล้วค่อยเลือกรอบบิล
      const pickedRoom = await handleSlipRoomChoice(ctx, data)
      if (pickedRoom) {
        await replyToLine(event.replyToken || "", pickedRoom, channelAccessToken)
        return true
      }

      const chosen = await handleSlipBillChoice(ctx, data)
      if (chosen) {
        await replyToLine(event.replyToken || "", chosen, channelAccessToken)
        return true
      }
      return false
    }

    if (event.type === "message" && event.message?.type === "image") {
      const messages = await handleSlipImage(ctx, event.message.id || "")
      // null = ไม่ควรตอบอะไรเลย (ไม่ใช่ผู้เช่า / ไม่มีบิลค้าง) — ถือว่าจัดการแล้ว ไม่ให้ตัวอื่นมายุ่ง
      if (messages) await replyToLine(event.replyToken || "", messages, channelAccessToken)
      return true
    }
  } catch (err) {
    console.error("line-slip: จัดการ event ไม่สำเร็จ:", err)
    return true
  }

  return false
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const urlWorkspaceId = searchParams.get("workspace_id")
    // scope=super_admin คือ webhook URL แยกต่างหากสำหรับ LINE OA ของทีมงาน HorSet เอง (channel คนละตัว
    // จากทุก workspace) — ใช้ตั้งค่า/ตาราง super_admin_line_settings + super_admin_connection_codes เท่านั้น
    const isSuperAdminScope = searchParams.get("scope") === "super_admin"

    // Read raw body as text for signature verification
    const rawBody = await request.text()

    const signature = request.headers.get("x-line-signature") || ""
    const supabase = getSystemClient()

    // 1. Fetch settings for signature verification ตาม scope ของ request
    let channelSecret = isSuperAdminScope ? "" : process.env.LINE_CHANNEL_SECRET || ""
    let channelAccessToken = isSuperAdminScope ? "" : process.env.LINE_CHANNEL_ACCESS_TOKEN || ""
    let activeWorkspaceId = urlWorkspaceId

    if (isSuperAdminScope) {
      const { data: saSettings } = await supabase
        .from("super_admin_line_settings")
        .select("channel_secret, channel_access_token")
        .eq("id", 1)
        .maybeSingle()

      if (saSettings) {
        if (saSettings.channel_secret) channelSecret = saSettings.channel_secret
        if (saSettings.channel_access_token) channelAccessToken = saSettings.channel_access_token
      }
    } else if (urlWorkspaceId) {
      const { data: wsSettings } = await supabase
        .from("workspace_line_settings")
        .select("channel_secret, channel_access_token")
        .eq("workspace_id", urlWorkspaceId)
        .maybeSingle()

      if (wsSettings) {
        if (wsSettings.channel_secret) {
          channelSecret = wsSettings.channel_secret
        }
        if (wsSettings.channel_access_token) {
          channelAccessToken = wsSettings.channel_access_token
        }
      }
    }

    // Parse events first to detect test payloads
    let body: any = {}
    try {
      body = JSON.parse(rawBody)
    } catch (e) {
      console.error("Failed to parse LINE Webhook body:", e)
    }
    const events = body.events || []

    // 2. Verify Webhook Signature if secret is available
    if (channelSecret && signature) {
      const isVerified = verifySignature(rawBody, channelSecret, signature)
      if (!isVerified) {
        // หากเป็นการกดปุ่ม Verify จากหน้า LINE Developers Console (ซึ่งจะส่ง events มาเป็นอาเรย์ว่าง [])
        // ให้ระบบส่งกลับ HTTP 200 OK เสมอ เพื่อให้ผ่านการทดสอบการเชื่อมต่อได้ทันที แม้แอดมินจะยังไม่ได้ตั้งค่าคีย์สำเร็จ
        if (events.length === 0) {
          console.log("LINE Webhook: Test verification request bypassed signature check successfully.")
          return NextResponse.json({ success: true, isTest: true })
        }

        console.error("LINE Webhook signature verification FAILED")
        return new NextResponse("Invalid Signature", { status: 401 })
      }
    }

    for (const event of events) {
      // ---- ส่งสลิปในแชท LINE (เฉพาะ webhook ของหอพัก ไม่ใช่ของทีมงาน) ----
      //
      // รับได้เฉพาะแชทส่วนตัวของผู้เช่า และต้องกดปุ่ม "ส่งสลิป" ใน rich menu ก่อนเสมอ
      // (ดูเหตุผลใน features/notification/line-slip.ts) แอดมินที่ผูก LINE ไว้รับแจ้งเตือน
      // อยู่ใน OA เดียวกัน จึงต้องข้ามไม่ให้รูปของแอดมินกลายเป็นสลิป
      if (!isSuperAdminScope && activeWorkspaceId && channelAccessToken) {
        const source = event.source || {}
        const isPrivateChat = source.type === "user" && !!source.userId
        const isSlipRelated =
          (event.type === "postback" && typeof event.postback?.data === "string") ||
          (event.type === "message" && event.message?.type === "image")

        if (isPrivateChat && isSlipRelated) {
          const handled = await handleLineSlipEvent({
            supabase,
            workspaceId: activeWorkspaceId,
            channelAccessToken,
            event
          })
          if (handled) continue
        }
      }

      // We only handle message events of type text
      if (event.type === "message" && event.message && event.message.type === "text") {
        const text = event.message.text.trim()
        const source = event.source || {}
        
        // Handle #MYID command (allows admin to get their User ID easily)
        if (text.toUpperCase() === "#MYID" || text.toUpperCase() === "/MYID" || text.includes("เช็ค ID") || text.includes("ขอ ID")) {
          const userId = source.userId
          if (userId && channelAccessToken) {
            await fetch("https://api.line.me/v2/bot/message/reply", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${channelAccessToken}`
              },
              body: JSON.stringify({
                replyToken: event.replyToken,
                messages: [
                  {
                    type: "text",
                    text: `👤 รหัส LINE User ID ของคุณคือ:\n\n${userId}\n\nกรุณาคัดลอกรหัสนี้ไปตั้งค่าในระบบหอพักเพื่อรับการแจ้งเตือนสลิปส่วนตัว`
                  }
                ]
              })
            })
          }
          continue
        }

        // Handle 6-digit numeric pairing code for Super Admin LINE Connection (คนละ flow จาก workspace admin
        // ด้านล่าง — ไม่มี workspace_id เกี่ยวข้องเลย ใช้ super_admin_line_settings/super_admin_connection_codes)
        if (isSuperAdminScope && /^\d{6}$/.test(text)) {
          const userId = source.userId
          if (userId) {
            const { data: codeData } = await supabase
              .from("super_admin_connection_codes")
              .select("expires_at")
              .eq("code", text)
              .eq("is_used", false)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle()

            if (codeData) {
              const { data: saSettings } = await supabase
                .from("super_admin_line_settings")
                .select("channel_access_token, admin_line_user_id")
                .eq("id", 1)
                .maybeSingle()

              const activeToken = saSettings?.channel_access_token || channelAccessToken

              if (activeToken && activeToken !== "placeholder" && activeToken.trim()) {
                const existingAdminsStr = saSettings?.admin_line_user_id || ""
                const existingAdmins = existingAdminsStr
                  .split(/[\s,\n]+/)
                  .map((id: string) => id.trim())
                  .filter((id: string) => id.length > 0)

                let replyMessageText = ""

                if (existingAdmins.includes(userId)) {
                  replyMessageText = `💡 บัญชี LINE ของคุณถูกผูกเป็น Super Admin อยู่แล้วในระบบครับ!`
                } else if (existingAdmins.length >= 5) {
                  replyMessageText = `⚠️ ขออภัย ระบบสามารถรองรับการผูกบัญชี LINE Super Admin ได้สูงสุด 5 คนแล้ว หากต้องการเชื่อมต่อเพิ่มเติม กรุณาลบคนเดิมในหน้าตั้งค่า Super Admin ออกก่อนครับ`
                } else {
                  existingAdmins.push(userId)
                  const newAdminsStr = existingAdmins.join(", ")

                  const { error: updateError } = await supabase
                    .from("super_admin_line_settings")
                    .update({ admin_line_user_id: newAdminsStr, updated_at: new Date().toISOString() })
                    .eq("id", 1)

                  if (updateError) {
                    console.error("Error updating super_admin_line_settings.admin_line_user_id:", updateError)
                    replyMessageText = `⚠️ เกิดข้อผิดพลาดทางเทคนิคในการผูกบัญชี กรุณาลองใหม่อีกครั้ง`
                  } else {
                    await supabase
                      .from("super_admin_connection_codes")
                      .update({ is_used: true })
                      .eq("code", text)

                    let displayName = "Super Admin"
                    try {
                      const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
                        method: "GET",
                        headers: { "Authorization": `Bearer ${activeToken}` }
                      })
                      if (profileRes.ok) {
                        const profileData = await profileRes.json()
                        if (profileData?.displayName) displayName = profileData.displayName
                      }
                    } catch (pErr) {
                      console.error("Error fetching super admin profile name:", pErr)
                    }

                    replyMessageText = `🎉 เชื่อมต่อบัญชีสำเร็จ!\n\nสวัสดีครับคุณ ${displayName}\n\nบัญชี LINE ของคุณได้รับการเชื่อมต่อเป็น Super Admin ของ HorSet เรียบร้อยแล้ว ตั้งแต่นี้ไปคุณจะได้รับการแจ้งเตือนระดับระบบทันทีครับ 🚀`
                  }
                }

                await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${activeToken}` },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [{ type: "text", text: replyMessageText }]
                  })
                })
              }
            } else if (channelAccessToken && channelAccessToken !== "placeholder") {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${channelAccessToken}` },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [{
                    type: "text",
                    text: `❌ รหัสเชื่อมต่อ "${text}" ไม่ถูกต้อง หมดอายุ (เกิน 5 นาที) หรือถูกใช้งานไปแล้ว\n\nกรุณากดปุ่ม "สร้างรหัสเชื่อมต่อ" ในหน้าตั้งค่า Super Admin เพื่อสร้างรหัสใหม่ครับ`
                  }]
                })
              })
            }
          }
          continue
        }

        // Handle 6-digit numeric pairing code for Admin LINE Connection
        if (!isSuperAdminScope && /^\d{6}$/.test(text)) {
          const userId = source.userId
          if (userId) {
            // Find active valid connection code from DB
            const { data: codeData, error: codeErr } = await supabase
              .from("admin_connection_codes")
              .select("workspace_id, expires_at")
              .eq("code", text)
              .eq("is_used", false)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle()

            if (codeErr) {
              console.error("Error querying admin_connection_codes:", codeErr)
            }

            if (codeData) {
              const pairedWorkspaceId = codeData.workspace_id

              // 1. Get workspace specific channel token dynamically
              const { data: wsSettings } = await supabase
                .from("workspace_line_settings")
                .select("channel_access_token, admin_line_user_id")
                .eq("workspace_id", pairedWorkspaceId)
                .maybeSingle()

              const activeToken = wsSettings?.channel_access_token || channelAccessToken

              if (activeToken && activeToken !== "placeholder" && activeToken.trim()) {
                // 2. Get current workspace name
                const { data: wsData } = await supabase
                  .from("workspaces")
                  .select("name")
                  .eq("id", pairedWorkspaceId)
                  .maybeSingle()

                const workspaceName = wsData?.name || "หอพักของคุณ"

                const existingAdminsStr = wsSettings?.admin_line_user_id || ""
                const existingAdmins = existingAdminsStr
                  .split(/[\s,\n]+/)
                  .map((id: string) => id.trim())
                  .filter((id: string) => id.length > 0)

                let replyMessageText = ""

                if (existingAdmins.includes(userId)) {
                  replyMessageText = `💡 บัญชี LINE ของคุณถูกผูกเป็นแอดมินสำหรับหอพัก "${workspaceName}" อยู่แล้วในระบบครับ!`
                } else if (existingAdmins.length >= 5) {
                  replyMessageText = `⚠️ ขออภัย ระบบสามารถรองรับการผูกบัญชี LINE Admin ได้สูงสุด 5 คนแล้ว หากต้องการเชื่อมต่อเพิ่มเติม กรุณาลบแอดมินคนเดิมในหน้าตั้งค่าของระบบหอพักออกก่อนครับ`
                } else {
                  // Add the new admin User ID
                  existingAdmins.push(userId)
                  const newAdminsStr = existingAdmins.join(", ")

                  // Update settings table
                  const { error: updateError } = await supabase
                    .from("workspace_line_settings")
                    .update({
                      admin_line_user_id: newAdminsStr,
                      updated_at: new Date().toISOString()
                    })
                    .eq("workspace_id", pairedWorkspaceId)

                  if (updateError) {
                    console.error("Error updating admin_line_user_id:", updateError)
                    replyMessageText = `⚠️ เกิดข้อผิดพลาดทางเทคนิคในการผูกบัญชี กรุณาลองใหม่อีกครั้ง`
                  } else {
                    // Mark connection code as used
                    await supabase
                      .from("admin_connection_codes")
                      .update({ is_used: true })
                      .eq("code", text)

                    // Try to fetch LINE user profile display name
                    let displayName = "แอดมิน"
                    try {
                      const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
                        method: "GET",
                        headers: {
                          "Authorization": `Bearer ${activeToken}`
                        }
                      })
                      if (profileRes.ok) {
                        const profileData = await profileRes.json()
                        if (profileData && profileData.displayName) {
                          displayName = profileData.displayName
                        }
                      }
                    } catch (pErr) {
                      console.error("Error fetching admin profile name:", pErr)
                    }

                    replyMessageText = `🎉 เชื่อมต่อบัญชีแอดมินสำเร็จ!\n\nสวัสดีครับคุณ ${displayName}\n\nยินดีต้อนรับเข้าสู่ระบบ! บัญชี LINE ของคุณได้รับการเชื่อมต่อเป็น LINE Admin สำหรับหอพัก "${workspaceName}" เรียบร้อยแล้ว ตั้งแต่นี้ไปคุณจะได้รับการแจ้งเตือนสลิปโอนเงินของผู้เช่าทันทีที่มีการส่งตรวจสอบครับ 🚀`
                  }
                }

                // Reply message to the admin
                await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${activeToken}`
                  },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [
                      {
                        type: "text",
                        text: replyMessageText
                      }
                    ]
                  })
                })
              }
            } else {
              // Code not found, expired, or already used
              if (channelAccessToken && channelAccessToken !== "placeholder") {
                await fetch("https://api.line.me/v2/bot/message/reply", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${channelAccessToken}`
                  },
                  body: JSON.stringify({
                    replyToken: event.replyToken,
                    messages: [
                      {
                        type: "text",
                        text: `❌ รหัสเชื่อมต่อ "${text}" ไม่ถูกต้อง หมดอายุ (เกิน 5 นาที) หรือถูกใช้งานไปแล้ว\n\nกรุณากดปุ่ม "เพิ่มการเชื่อมต่อ Line Admin" ในหน้าตั้งค่าเว็บระบบหอพัก เพื่อสร้างรหัสใหม่ที่มีอายุ 5 นาที และส่งกลับมาอีกครั้งครับ`
                      }
                    ]
                  })
                })
              }
            }
          }
          continue
        }

        // Handle #CONNECT- command for connecting Group ID (ยังไม่รองรับฝั่ง Super Admin — ผูกกลุ่มได้ manual เท่านั้น)
        if (!isSuperAdminScope && text.toUpperCase().startsWith("#CONNECT-")) {
          const connectionCode = text.substring(9).trim().toLowerCase()
          
          if (source.type !== "group") {
            // Reply warning if not sent in a group
            if (channelAccessToken) {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${channelAccessToken}`
                },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [
                    {
                      type: "text",
                      text: "⚠️ คำสั่งนี้ต้องใช้ภายในกลุ่มไลน์ทีมงานนิติบุคคลเท่านั้น กรุณาดึงบอตตัวนี้เข้ากลุ่มแล้วพิมพ์รหัสใหม่อีกครั้ง"
                    }
                  ]
                })
              })
            }
            continue
          }

          const groupId = source.groupId
          if (!groupId) continue

          // Find workspace by connectionCode
          let matchedWorkspaceId: string | null = null

          if (connectionCode.length === 36) {
            // Full UUID
            matchedWorkspaceId = connectionCode
          } else if (connectionCode.length >= 6) {
            // Find by matching prefix of workspace_id
            const { data: allSettings } = await supabase
              .from("workspace_line_settings")
              .select("workspace_id")

            if (allSettings) {
              const match = allSettings.find(row => 
                row.workspace_id.toLowerCase().startsWith(connectionCode)
              )
              if (match) {
                matchedWorkspaceId = match.workspace_id
              }
            }
          }

          if (matchedWorkspaceId) {
            // Update workspace_line_settings to save group_id
            const { error: updateError } = await supabase
              .from("workspace_line_settings")
              .update({
                admin_line_group_id: groupId,
                updated_at: new Date().toISOString()
              })
              .eq("workspace_id", matchedWorkspaceId)

            if (updateError) {
              console.error("Error saving admin_line_group_id:", updateError)
              continue
            }

            // Get bot and workspace details to reply
            const { data: wsData } = await supabase
              .from("workspaces")
              .select("name")
              .eq("id", matchedWorkspaceId)
              .maybeSingle()

            const wsName = wsData?.name || "หอพักของคุณ"

            // Reply confirmation to the group
            if (channelAccessToken) {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${channelAccessToken}`
                },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [
                    {
                      type: "text",
                      text: `✅ เชื่อมต่อกลุ่มไลน์สำเร็จ!\n\n🏢 หอพัก: ${wsName}\n👥 รหัสกลุ่ม: ${groupId}\n\nตั้งแต่นี้ไป ระบบจะแจ้งเตือนเมื่อมีผู้เช่าส่งหลักฐานการโอนเงิน/สลิปโอนเงินเข้ามายังกลุ่มนี้โดยอัตโนมัติ 🚀`
                    }
                  ]
                })
              })
            }
          } else {
            // Reply that connection code was not found
            if (channelAccessToken) {
              await fetch("https://api.line.me/v2/bot/message/reply", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${channelAccessToken}`
                },
                body: JSON.stringify({
                  replyToken: event.replyToken,
                  messages: [
                    {
                      type: "text",
                      text: `❌ ไม่พบข้อมูลหอพักที่มีรหัสเชื่อมต่อ "${connectionCode}" ในระบบ กรุณาตรวจสอบรหัสเชื่อมต่ออีกครั้งจากเมนูตั้งค่าระบบหอพัก`
                    }
                  ]
                })
              })
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("LINE Webhook exception:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
