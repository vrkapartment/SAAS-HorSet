import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { Translate } from "@google-cloud/translate/build/src/v2"
import { decryptText } from "@/lib/encryption"

export async function POST(request: Request) {
  try {
    const { text, targetLanguage } = await request.json()

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: "Missing text or targetLanguage" }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
    
    // Create admin client to bypass RLS for system settings and cached translations
    const supabaseAdmin = createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 1. Check Cache first
    const { data: cached } = await supabaseAdmin
      .from("cached_translations")
      .select("translated_text")
      .eq("source_text", text)
      .eq("target_language", targetLanguage)
      .single()

    if (cached) {
      return NextResponse.json({ translatedText: cached.translated_text })
    }

    // 2. Fetch API Keys from DB
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["GOOGLE_PROJECT_ID", "GOOGLE_SERVICE_ACCOUNT_KEY"])

    if (settingsError) throw settingsError

    const projectIdSetting = settings.find(s => s.key === "GOOGLE_PROJECT_ID")
    const serviceKeySetting = settings.find(s => s.key === "GOOGLE_SERVICE_ACCOUNT_KEY")

    if (!projectIdSetting?.value || !serviceKeySetting?.value) {
      return NextResponse.json({ error: "Google Translation API credentials not configured" }, { status: 500 })
    }

    const projectId = projectIdSetting.value
    let credentials
    try {
      const decryptedKeyString = decryptText(serviceKeySetting.value)
      credentials = JSON.parse(decryptedKeyString)
    } catch (err) {
      console.error("Failed to parse Google Service Account Key JSON", err)
      return NextResponse.json({ error: "Invalid Google Service Account Key format" }, { status: 500 })
    }

    // 3. Initialize Google Translate Client
    const translate = new Translate({
      projectId,
      credentials
    })

    // 4. Perform Translation
    const [translation] = await translate.translate(text, targetLanguage)

    // 5. Cache the result asynchronously
    if (translation) {
      // Don't await so we can return response faster
      supabaseAdmin.from("cached_translations").insert({
        source_text: text,
        target_language: targetLanguage,
        translated_text: translation
      }).then(({ error }) => {
        if (error) console.error("Failed to cache translation", error)
      })
    }

    return NextResponse.json({ translatedText: translation })

  } catch (error: any) {
    console.error("Translation API Error:", error)
    return NextResponse.json({ error: error.message || "Translation failed" }, { status: 500 })
  }
}
