import { useState, useEffect } from "react"
import { useLanguage } from "./LanguageProvider"

// In-memory cache for the current session to avoid redundant API calls within the same page load
const memoryCache = new Map<string, string>()

export function useDynamicTranslation(text: string | null | undefined) {
  const { locale } = useLanguage()
  const [translatedText, setTranslatedText] = useState<string>(text || "")
  const [isTranslating, setIsTranslating] = useState<boolean>(false)

  useEffect(() => {
    // If text is empty or locale is Thai (default), just use the original text
    if (!text) {
      setTranslatedText("")
      return
    }

    if (locale === "th") {
      setTranslatedText(text)
      return
    }

    // Locale is "en" (or something else), we need to translate
    const cacheKey = `${locale}:${text}`
    if (memoryCache.has(cacheKey)) {
      setTranslatedText(memoryCache.get(cacheKey)!)
      return
    }

    let isMounted = true

    const fetchTranslation = async () => {
      setIsTranslating(true)
      try {
        console.debug("Requesting translation:", { text, locale })
        const response = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, targetLanguage: locale }),
        })

        if (response.ok) {
          const data = await response.json()
          if (data.translatedText) {
            memoryCache.set(cacheKey, data.translatedText)
            if (isMounted) setTranslatedText(data.translatedText)
          } else {
            console.warn("Translation API returned 200 but no translatedText:", data)
            // Fallback to original text if no translation received
            if (isMounted) setTranslatedText(text)
          }
        } else {
          const errorBody = await response.json().catch(() => null)
          console.error("Translation API returned an error:", response.status, errorBody)
          // Fallback to original on API error
          if (isMounted) setTranslatedText(text)
        }
      } catch (error) {
        console.error("Translation hook error:", error)
        // Fallback to original
        if (isMounted) setTranslatedText(text)
      } finally {
        if (isMounted) setIsTranslating(false)
      }
    }

    fetchTranslation()

    return () => {
      isMounted = false
    }
  }, [text, locale])

  return { translatedText, isTranslating, originalText: text || "" }
}
