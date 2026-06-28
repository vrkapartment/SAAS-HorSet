import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspace_id")
    const defaultLiffId = "2010442620-H4josaDy"

    if (!workspaceId) {
      return NextResponse.json({ success: true, liffId: defaultLiffId })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("workspace_line_settings")
      .select("liff_id")
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) {
      console.warn("Error fetching workspace LIFF ID, falling back to default:", error.message)
      return NextResponse.json({ success: true, liffId: defaultLiffId })
    }

    const liffId = data?.liff_id || defaultLiffId
    return NextResponse.json({ success: true, liffId })
  } catch (error: any) {
    console.error("Workspace LIFF API Exception:", error)
    return NextResponse.json({ success: true, liffId: "2010442620-H4josaDy" }) // Always safe fallback
  }
}
