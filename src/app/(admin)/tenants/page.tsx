"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function TenantsPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/rooms")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="w-6.5 h-6.5 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
