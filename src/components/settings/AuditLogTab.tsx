"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronDown,
  History,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  ShieldQuestion,
  TrendingDown
} from "lucide-react"
import {
  getAuditActorsAction,
  getAuditLogsAction,
  type AuditLogRow
} from "@/features/audit/actions"
import {
  ACTION_LABELS,
  AUDITED_TABLES,
  auditChanges,
  decreaseWarning,
  formatValue,
  tableLabel
} from "@/features/audit/labels"

/**
 * แท็บ "ประวัติการแก้ไข" (settings?tab=audit-log)
 *
 * แสดง audit log ที่ trigger ในฐานข้อมูลจดไว้ เพื่อตรวจย้อนหลังว่าใครแก้เลขอะไร
 *
 * หลักการแสดงผล 3 ข้อ:
 *   1. ไม่โชว์ JSON ดิบ — แปลชื่อฟิลด์เป็นไทยและจัดเป็นตาราง ก่อน → หลัง
 *   2. ติดป้าย "น้ำหนักหลักฐาน" ให้เห็น (ยืนยันตัวตน / เซิร์ฟเวอร์ยืนยัน / ระบบ / ไม่ทราบผู้ทำ)
 *      เพราะ log ที่มาจาก service-role เชื่อถือได้ไม่เท่าที่ยืนยันด้วย JWT
 *   3. สะกิดตาเมื่อตัวเลขลดลงในทางที่เสียประโยชน์ (มิเตอร์ลด ค่าปรับลด)
 *      เป็นตัวช่วยสังเกต ไม่ได้ตัดสินว่าผิด
 */

type ActorOption = { id: string; name: string; role: string | null }

const DAY_OPTIONS = [
  { value: 7, label: "7 วัน" },
  { value: 30, label: "30 วัน" },
  { value: 90, label: "90 วัน" },
  { value: 365, label: "1 ปี" }
]

const ACTION_OPTIONS = ["INSERT", "UPDATE", "DELETE"] as const

/** ป้ายบอกว่าเชื่อถือได้แค่ไหน — ส่วนที่สำคัญที่สุดของหน้านี้ */
function SourceBadge({ source, actorId }: { source: string; actorId: string | null }) {
  if (source === "jwt") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-700 dark:text-emerald-400">
        <ShieldCheck className="h-3 w-3" />
        ยืนยันตัวตน
      </span>
    )
  }
  // โค้ดฝั่งเซิร์ฟเวอร์แจ้งตัวตนมาหลังตรวจ session แล้ว แต่ไม่ได้พิสูจน์ด้วยลายเซ็น JWT
  // (จำเป็นสำหรับงานที่ต้องเขียนผ่าน Service Role เช่นบันทึกตั้งค่าหอ)
  // ปลอมได้เฉพาะผู้ที่ถือ service role key ซึ่งอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
  if (source === "server" && actorId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-black text-sky-700 dark:text-sky-400">
        <ServerCog className="h-3 w-3" />
        เซิร์ฟเวอร์ยืนยัน
      </span>
    )
  }
  // ไม่มี actor_id เลย = ระบบทำเอง (cron / SlipOK / webhook LINE / ลิงก์ผู้เช่า)
  if (!actorId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-black text-slate-600 dark:text-slate-400">
        <Bot className="h-3 w-3" />
        ระบบ
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-black text-amber-700 dark:text-amber-500">
      <ShieldQuestion className="h-3 w-3" />
      ไม่ทราบผู้ทำ
    </span>
  )
}

/** ตารางเปรียบเทียบ ก่อน → หลัง ของแถวหนึ่ง */
function ChangeTable({ row }: { row: AuditLogRow }) {
  // ตรรกะว่ากางอะไร ซ่อนอะไร รวมอยู่ใน auditChanges ที่เดียว (features/audit/labels.ts)
  const changes = useMemo(() => auditChanges(row), [row])

  const [expanded, setExpanded] = useState(false)
  const LIMIT = 6
  const shown = expanded ? changes : changes.slice(0, LIMIT)

  if (changes.length === 0) {
    return <p className="text-[11px] font-bold text-slate-400">ไม่มีรายละเอียดที่บันทึกไว้</p>
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-left">
          <tbody>
            {shown.map(change => {
              const { before, after } = change
              const warn = decreaseWarning(change.field, before, after)
              return (
                <tr key={change.key} className="border-t border-slate-100 dark:border-slate-800/70">
                  <td className="w-[38%] py-1.5 pr-2 align-top text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    {change.label}
                  </td>
                  <td className="py-1.5 align-top">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {row.action !== "INSERT" && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                          {formatValue(before)}
                        </span>
                      )}
                      {row.action === "UPDATE" && (
                        <ArrowRight className="h-3 w-3 shrink-0 text-slate-400" />
                      )}
                      {row.action !== "DELETE" && (
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-black text-white dark:bg-slate-200 dark:text-slate-900">
                          {formatValue(after)}
                        </span>
                      )}
                      {warn && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black text-amber-600 dark:text-amber-500">
                          <TrendingDown className="h-3 w-3" />
                          ลดลง {warn.amount.toLocaleString("th-TH")}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {changes.length > LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-[11px] font-black text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {expanded ? "ย่อ" : `ดูอีก ${changes.length - LIMIT} รายการ`}
        </button>
      )}
    </div>
  )
}

export default function AuditLogTab() {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [actors, setActors] = useState<ActorOption[]>([])
  const [hasSystem, setHasSystem] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [nextBeforeId, setNextBeforeId] = useState<number | null>(null)

  // ตัวกรอง
  const [days, setDays] = useState(7)
  const [tables, setTables] = useState<string[]>([])
  const [actions, setActions] = useState<string[]>([])
  const [actorId, setActorId] = useState<string>("")
  const [searchInput, setSearchInput] = useState("")
  const [search, setSearch] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getAuditLogsAction({ days, tables, actions, actorId: actorId || null, search })
      if (res.success && res.data) {
        setRows(res.data.rows)
        setHasMore(res.data.hasMore)
        setNextBeforeId(res.data.nextBeforeId)
      } else {
        setRows([])
        setError(res.error || "อ่านประวัติการแก้ไขไม่สำเร็จ")
      }
    } catch (err) {
      setRows([])
      setError(err instanceof Error ? err.message : "อ่านประวัติการแก้ไขไม่สำเร็จ")
    } finally {
      setLoading(false)
    }
  }, [days, tables, actions, actorId, search])

  // เรียกใน callback ของ timer เพื่อไม่ให้ setState เกิดในจังหวะเดียวกับ render รอบแรก
  useEffect(() => {
    const timer = setTimeout(() => { load() }, 0)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    const timer = setTimeout(async () => {
      const res = await getAuditActorsAction(365)
      if (res.success && res.data) {
        setActors(res.data.actors)
        setHasSystem(res.data.hasSystem)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  const loadMore = async () => {
    if (!nextBeforeId) return
    setLoadingMore(true)
    try {
      const res = await getAuditLogsAction({
        days, tables, actions, actorId: actorId || null, search, beforeId: nextBeforeId
      })
      if (res.success && res.data) {
        setRows(prev => [...prev, ...res.data.rows])
        setHasMore(res.data.hasMore)
        setNextBeforeId(res.data.nextBeforeId)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const toggle = (list: string[], value: string, setter: (v: string[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value])
  }

  const activeFilterCount =
    tables.length + actions.length + (actorId ? 1 : 0) + (search ? 1 : 0)

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("th-TH", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
      })
    } catch {
      return iso
    }
  }

  return (
    <div className="space-y-4">
      {/* หัวข้อ */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-xl bg-violet-500/10 p-2.5 text-violet-500">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 md:text-xl">
                ประวัติการแก้ไข
              </h3>
              <p className="mt-1.5 text-[11px] font-bold leading-relaxed text-slate-400 dark:text-slate-500 sm:text-xs">
                บันทึกทุกการแก้ข้อมูลบิล มิเตอร์ รายจ่าย ตั้งค่าหอ ผู้เช่า ห้องพัก และสิทธิ์ผู้ใช้ —
                จดโดยฐานข้อมูลเอง แก้และลบไม่ได้
              </p>
            </div>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-violet-500 disabled:text-slate-300 dark:hover:bg-slate-800 dark:disabled:text-slate-700"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          >
            {DAY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>ย้อนหลัง {o.label}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[160px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") setSearch(searchInput) }}
              onBlur={() => setSearch(searchInput)}
              placeholder="ค้นหาเลขห้อง / รอบบิล / ชื่อรายการ"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs font-bold text-slate-700 placeholder:font-medium placeholder:text-slate-400 focus:border-violet-400 focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>

          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
          >
            ตัวกรอง
            {activeFilterCount > 0 && (
              <span className="rounded-md bg-violet-500 px-1.5 text-[10px] font-black text-white">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {filtersOpen && (
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3 dark:border-slate-800">
            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">เรื่อง</span>
              <div className="flex flex-wrap gap-1.5">
                {AUDITED_TABLES.map(t => {
                  const meta = tableLabel(t)
                  const on = tables.includes(t)
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggle(tables, t, setTables)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                        on
                          ? "bg-violet-600 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                      }`}
                    >
                      {meta.icon} {meta.th}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">การกระทำ</span>
              <div className="flex flex-wrap gap-1.5">
                {ACTION_OPTIONS.map(a => {
                  const on = actions.includes(a)
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => toggle(actions, a, setActions)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                        on
                          ? "bg-violet-600 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-violet-400 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                      }`}
                    >
                      {ACTION_LABELS[a]}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">คนทำ</span>
              <select
                value={actorId}
                onChange={e => setActorId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 sm:w-auto"
              >
                <option value="">ทุกคน</option>
                {hasSystem && <option value="system">ระบบทำเอง (cron / ตรวจสลิป / LINE)</option>}
                {actors.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}{a.role ? ` (${a.role})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setTables([]); setActions([]); setActorId("")
                  setSearchInput(""); setSearch("")
                }}
                className="text-[11px] font-black text-slate-500 hover:underline dark:text-slate-400"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2.5 rounded-3xl border border-rose-500/25 bg-rose-500/10 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <p className="text-[11px] font-bold leading-relaxed text-rose-700 dark:text-rose-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2.5 rounded-3xl border border-slate-200 bg-white p-6 text-xs font-bold text-slate-400 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>กำลังโหลดประวัติการแก้ไข...</span>
        </div>
      ) : rows.length === 0 && !error ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <History className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-700" />
          <p className="mt-3 text-sm font-black text-slate-600 dark:text-slate-300">
            ไม่พบประวัติการแก้ไข
          </p>
          <p className="mt-1 text-[11px] font-bold text-slate-400">
            {activeFilterCount > 0
              ? "ลองขยายช่วงเวลา หรือล้างตัวกรอง"
              : "ยังไม่มีการแก้ข้อมูลในช่วงเวลานี้"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const meta = tableLabel(row.tableName)
            const isDelete = row.action === "DELETE"
            return (
              <div
                key={row.id}
                className={`rounded-3xl border bg-white p-4 shadow-sm dark:bg-slate-900 ${
                  isDelete
                    ? "border-rose-500/25"
                    : "border-slate-200 dark:border-slate-800"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100">
                        {meta.icon} {meta.th}
                      </span>
                      {row.recordLabel && (
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                          — {row.recordLabel}
                        </span>
                      )}
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                          row.action === "DELETE"
                            ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : row.action === "INSERT"
                              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              : "bg-slate-500/10 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {ACTION_LABELS[row.action] || row.action}
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {row.actorName || (row.actorId ? "(ไม่ทราบชื่อ)" : "ระบบ")}
                        {row.actorRole ? ` · ${row.actorRole}` : ""}
                      </span>
                      <SourceBadge source={row.actorSource} actorId={row.actorId} />
                    </div>
                  </div>

                  <span className="shrink-0 text-[11px] font-bold text-slate-400">
                    {formatTime(row.createdAt)}
                  </span>
                </div>

                <div className="mt-3">
                  <ChangeTable row={row} />
                </div>
              </div>
            )
          })}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-xs font-black text-slate-600 transition-colors hover:border-violet-400 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            >
              {loadingMore ? "กำลังโหลด..." : "โหลดเพิ่ม"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
