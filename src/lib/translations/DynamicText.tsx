import React from "react"
import { useDynamicTranslation } from "./useDynamicTranslation"

export function DynamicText({ children, className }: { children: string | null | undefined, className?: string }) {
  const { translatedText, isTranslating } = useDynamicTranslation(children)

  if (!children) return null

  return (
    <span className={`${className || ""} ${isTranslating ? "opacity-70 transition-opacity" : "transition-opacity duration-300"}`}>
      {translatedText}
    </span>
  )
}
