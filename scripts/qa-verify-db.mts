/**
 * QA harness: ตรวจความถูกต้องของข้อมูลในฐานข้อมูล — อ่านอย่างเดียว
 *
 * ใช้: npm run qa:db
 *
 * ⚠️ อ่านอย่างเดียวเท่านั้น (select) ไม่มี insert/update/delete ทั้งไฟล์
 * ⚠️ ไม่พิมพ์ข้อมูลส่วนบุคคล (ชื่อ/เบอร์ผู้เช่า) ออกมา — รายงานเป็นจำนวนนับกับเลขห้องเท่านั้น
 *
 * ใช้ SUPABASE_SERVICE_ROLE_KEY ซึ่ง bypass RLS จึงเห็นข้อมูลทุก workspace
 * ตั้ง QA_DB_URL / QA_DB_KEY ใน env เพื่อชี้ไปฐานข้อมูลอื่น (เช่น staging) แทน production ได้
 */

import { qaClient, meterUnits, must } from "./qa-db"
import { resolveBillLines } from "../src/lib/billLines"
import { parseUtilitySegments } from "../src/lib/billSegments"

const { db, label: dbLabel } = qaClient()

type Check = { name: string; why: string; run: () => Promise<{ ok: boolean; detail: string }> }

const checks: Check[] = [
  {
    name: "ห้องทุกห้องต้องมีอาคาร",
    why: "ห้องที่ building_id เป็น null ไม่ถูกกฎกันเลขห้องซ้ำในอาคารเดียวกันคุ้มกัน (null ไม่ conflict ใน Postgres)",
    run: async () => {
      const { count, error } = await db.from("rooms").select("*", { count: "exact", head: true })
        .is("building_id", null)
      if (error) throw error
      return { ok: (count ?? 0) === 0, detail: `ห้องที่ไม่มีอาคาร: ${count ?? 0}` }
    }
  },
  {
    name: "ห้ามเลขห้องซ้ำในอาคารเดียวกัน",
    why: "กฎหลักของฟีเจอร์เลขห้องซ้ำข้ามอาคาร ถ้าซ้ำในอาคารเดียวกันคือ constraint หลุด",
    run: async () => {
      const { data, error } = await db.from("rooms").select("workspace_id, building_id, room_number")
      if (error) throw error
      const seen = new Map<string, number>()
      for (const r of data ?? []) {
        const k = `${r.workspace_id}|${r.building_id}|${r.room_number}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1)
      return { ok: dups.length === 0, detail: dups.length === 0 ? "ไม่มีซ้ำ" : `ซ้ำ ${dups.length} กลุ่ม` }
    }
  },
  {
    name: "มิเตอร์/บิล/การเปลี่ยนมิเตอร์ ต้องมี room_id",
    why: "unique constraint ใหม่คีย์ด้วย room_id แถวที่เป็น null ไม่ถูกคุ้มกัน กดบันทึกซ้ำจะได้แถวซ้ำ",
    run: async () => {
      const out: string[] = []
      let ok = true
      for (const t of ["meter_records", "bills", "meter_replacements"]) {
        const { count, error } = await db.from(t).select("*", { count: "exact", head: true })
          .is("room_id", null)
        if (error) throw error
        if ((count ?? 0) > 0) ok = false
        out.push(`${t}: ${count ?? 0}`)
      }
      return { ok, detail: `แถวที่ room_id เป็น null → ${out.join(" · ")}` }
    }
  },
  {
    name: "ห้ามมีบิลซ้ำในห้อง+รอบ+ชนิดเดียวกัน",
    why: "ถ้าซ้ำ maybeSingle() ในการเช็คบิลเดิมจะ error และการออกบิลจะพังทันที",
    run: async () => {
      const { data, error } = await db.from("bills").select("workspace_id, room_id, billing_cycle, bill_kind")
      if (error) throw error
      const seen = new Map<string, number>()
      for (const b of data ?? []) {
        if (!b.room_id) continue
        const k = `${b.workspace_id}|${b.room_id}|${b.billing_cycle}|${b.bill_kind}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1)
      return { ok: dups.length === 0, detail: dups.length === 0 ? "ไม่มีซ้ำ" : `ซ้ำ ${dups.length} กลุ่ม` }
    }
  },
  {
    name: "ทุกอาคารต้องมีรหัส",
    why: "รหัสอาคารไปอยู่บนเลขใบกำกับ ถ้าไม่มีรหัส บิลของสองอาคารที่ใช้เลขห้องเดียวกันจะได้เลขใบเดียวกัน",
    run: async () => {
      const { count, error } = await db.from("buildings").select("*", { count: "exact", head: true })
        .or("code.is.null,code.eq.")
      if (error) throw error
      return { ok: (count ?? 0) === 0, detail: `อาคารที่ยังไม่มีรหัส: ${count ?? 0}` }
    }
  },
  {
    name: "ห้ามมีเลขใบกำกับซ้ำในหอเดียวกัน",
    why: "ผู้เช่าสองห้องได้ใบเลขเดียวกันจะแยกไม่ออกว่าใบไหนของใคร",
    run: async () => {
      const { data, error } = await db.from("bills").select("workspace_id, invoice_id")
      if (error) throw error
      const seen = new Map<string, number>()
      for (const b of data ?? []) {
        if (!b.invoice_id) continue
        const k = `${b.workspace_id}|${b.invoice_id}`
        seen.set(k, (seen.get(k) ?? 0) + 1)
      }
      const dups = [...seen.entries()].filter(([, n]) => n > 1)
      return { ok: dups.length === 0, detail: dups.length === 0 ? "ไม่มีซ้ำ" : `ซ้ำ ${dups.length} เลข` }
    }
  },
  {
    name: "บิลที่มี snapshot — รายการย่อยต้องบวกได้เท่ายอดรวม",
    why: "ถ้าไม่เท่า ใบแจ้งหนี้อธิบายที่มาของยอดที่เรียกเก็บไม่ได้",
    run: async () => {
      // ใช้ resolveBillLines ตัวเดียวกับที่ PDF และ Portal ใช้ ไม่เขียนสูตรบวกซ้ำที่นี่
      // ถ้าเขียนซ้ำ วันที่บิลมีองค์ประกอบใหม่ (เช่นส่วนของห้องเดิมตอนย้ายห้อง) สคริปต์นี้จะ
      // FAIL ทุกใบทั้งที่ยอดถูก แล้วคนจะเลิกอ่านผลลัพธ์ — อันตรายกว่าไม่มีข้อตรวจเลย
      const { data, error } = await db.from("bills")
        .select("invoice_id, amount, base_rent, electric_amount, water_amount, common_fee, other_service_amount, penalty_amount, vat_amount, extra_expenses, utility_segments, electric_units, water_units, electric_rate, water_rate")
        .not("base_rent", "is", null)
      if (error) throw error
      if (!data || data.length === 0) return { ok: true, detail: "ยังไม่มีบิลที่มี snapshot (ออกบิลใบใหม่ก่อน)" }
      const bad: string[] = []
      for (const b of data) {
        const lines = resolveBillLines({
          hasSnapshot: true,
          amount: Number(b.amount || 0),
          baseRent: Number(b.base_rent || 0),
          electricUnits: Number(b.electric_units || 0),
          electricRate: Number(b.electric_rate || 0),
          waterUnits: Number(b.water_units || 0),
          waterRate: Number(b.water_rate || 0),
          electricAmount: Number(b.electric_amount || 0),
          waterAmount: Number(b.water_amount || 0),
          commonFee: Number(b.common_fee || 0),
          otherServiceAmount: Number(b.other_service_amount || 0),
          penaltyAmount: Number(b.penalty_amount || 0),
          vatAmount: Number(b.vat_amount || 0),
          extraExpenses: Array.isArray(b.extra_expenses) ? b.extra_expenses : [],
          utilitySegments: b.utility_segments
        })
        if (Math.abs(lines.lineSum - Number(b.amount || 0)) > 0.01) {
          const segNote = lines.segmentUtilitySum + lines.segmentRentSum > 0
            ? ` (รวมส่วนห้องเดิม ${(lines.segmentUtilitySum + lines.segmentRentSum).toLocaleString()})`
            : ""
          bad.push(`${b.invoice_id}: รายการย่อย ${lines.lineSum.toLocaleString()}${segNote} ≠ ยอดรวม ${Number(b.amount).toLocaleString()}`)
        }
      }
      return {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `ตรวจ ${data.length} ใบ บวกได้เท่ายอดรวมทุกใบ`
          : `ไม่ตรง ${bad.length}/${data.length} ใบ:\n      ${bad.slice(0, 10).join("\n      ")}`
      }
    }
  },
  {
    name: "หน่วยน้ำ-ไฟในบิล ต้องตรงกับเลขมิเตอร์ที่บันทึกในบิลเดียวกัน",
    why: "ถ้าไม่ตรง แปลว่าบิลคิดเงินจากจำนวนหน่วยที่ไม่ใช่ของมิเตอร์ใบนั้น = เก็บเงินผิดจำนวน",
    run: async () => {
      // ตรวจเฉพาะบิลที่มี snapshot เพราะบิลเก่าไม่ได้เก็บเลขมิเตอร์ไว้ให้เทียบ
      const { data, error } = await db.from("bills")
        .select("invoice_id, electric_units, water_units, elec_prev, elec_curr, water_prev, water_curr")
        .not("base_rent", "is", null)
      if (error) throw error
      if (!data?.length) return { ok: true, detail: "ยังไม่มีบิลที่มี snapshot" }

      // มิเตอร์หมุนครบรอบ (curr < prev) ใช้สูตรเดียวกับฝั่งแอปผ่าน meterUnits()
      const expected = meterUnits

      const bad: string[] = []
      for (const b of data) {
        const pairs: [string, unknown, unknown, unknown][] = [
          ["ไฟ", b.electric_units, b.elec_prev, b.elec_curr],
          ["น้ำ", b.water_units, b.water_prev, b.water_curr]
        ]
        for (const [label, units, prev, curr] of pairs) {
          if (prev === null || prev === undefined || curr === null || curr === undefined) continue
          const exp = expected(Number(curr), Number(prev))
          if (Number(units) !== exp) {
            bad.push(`${b.invoice_id} (${label}): บิลเก็บ ${units} หน่วย แต่มิเตอร์ ${prev} → ${curr} = ${exp} หน่วย`)
          }
        }
      }
      const head = `ตรวจ ${data.length} ใบ`
      return {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `${head} หน่วยตรงกับเลขมิเตอร์ทุกใบ`
          : `${head} ไม่ตรง ${bad.length} รายการ:\n      ` + bad.slice(0, 10).join("\n      ")
      }
    }
  },
  {
    name: "เลขมิเตอร์ต้องต่อเนื่องระหว่างรอบ (prev ของรอบนี้ = curr ของรอบก่อน)",
    why: "ถ้าไม่ต่อเนื่องแล้วไม่ใช่เพราะมีเหตุการณ์ย้าย = มีหน่วยที่ไม่มีใครถูกเรียกเก็บ หรือถูกเก็บซ้ำ",
    run: async () => {
      // ข้อยกเว้นที่ถูกต้อง: ห้องที่เปลี่ยนผู้เช่ากลางรอบ จะมีหมุด occupancy_start_* ปักไว้
      // แถวพวกนั้นตั้งใจให้ prev ไม่ต่อจากรอบก่อน (เริ่มนับใหม่ที่เลขปิดห้องของคนก่อน)
      const rows = must("มิเตอร์ทั้งหมด", await db.from("meter_records")
        .select("room_id, room_number, billing_cycle, elec_prev, elec_curr, water_prev, water_curr, occupancy_start_elec")
        .order("billing_cycle", { ascending: true }))

      const byRoom = new Map<string, typeof rows>()
      for (const r of rows) {
        if (!r.room_id) continue
        const list = byRoom.get(r.room_id as string) ?? []
        list.push(r)
        byRoom.set(r.room_id as string, list)
      }

      const bad: string[] = []
      let compared = 0
      let skippedByMarker = 0
      for (const list of byRoom.values()) {
        for (let i = 1; i < list.length; i++) {
          const prevRow = list[i - 1]
          const row = list[i]
          // รอบก่อนยังไม่จด curr → ไม่มีอะไรให้เทียบ (ห้องว่างหรือยังไม่ถึงรอบ)
          if (prevRow.elec_curr === null || prevRow.elec_curr === undefined) continue
          if (row.occupancy_start_elec !== null && row.occupancy_start_elec !== undefined) { skippedByMarker++; continue }
          compared++
          const gap = Number(row.elec_prev ?? 0) - Number(prevRow.elec_curr)
          if (Math.abs(gap) > 0.01) {
            bad.push(`ห้อง ${row.room_number} รอบ ${row.billing_cycle}: prev ${row.elec_prev} ≠ curr รอบ ${prevRow.billing_cycle} (${prevRow.elec_curr}) ต่าง ${gap}`)
          }
        }
      }

      const note = skippedByMarker > 0 ? ` · ข้ามที่มีหมุดย้ายผู้เช่า ${skippedByMarker} แถว` : ""
      return {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `เทียบ ${compared} คู่รอบ ต่อเนื่องทุกคู่${note}`
          : `ไม่ต่อเนื่อง ${bad.length}/${compared} คู่${note}:\n      ` + bad.slice(0, 10).join("\n      ")
      }
    }
  },
  {
    name: "หมุดเลขตั้งต้นกลางรอบ ต้องตรงกับ elec_prev ของแถวนั้น",
    why: "หมุดเป็นตัวที่หน้าออกบิลใช้เป็น prev ถ้าไม่ตรงกับ elec_prev ที่บันทึกไว้ บิลกับมิเตอร์จะเล่าเรื่องคนละเรื่อง",
    run: async () => {
      const rows = must("แถวที่มีหมุดย้ายผู้เช่า", await db.from("meter_records")
        .select("room_number, billing_cycle, elec_prev, water_prev, occupancy_start_elec, occupancy_start_water, occupancy_start_reason")
        .not("occupancy_start_elec", "is", null))

      if (rows.length === 0) return { ok: true, detail: "ยังไม่มีห้องที่เปลี่ยนผู้เช่ากลางรอบ" }

      const bad: string[] = []
      for (const r of rows) {
        if (Math.abs(Number(r.elec_prev ?? 0) - Number(r.occupancy_start_elec)) > 0.01) {
          bad.push(`ห้อง ${r.room_number} รอบ ${r.billing_cycle}: elec_prev ${r.elec_prev} ≠ หมุด ${r.occupancy_start_elec}`)
        }
        if (Math.abs(Number(r.water_prev ?? 0) - Number(r.occupancy_start_water ?? 0)) > 0.01) {
          bad.push(`ห้อง ${r.room_number} รอบ ${r.billing_cycle}: water_prev ${r.water_prev} ≠ หมุด ${r.occupancy_start_water}`)
        }
      }
      return {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `ตรวจ ${rows.length} แถวที่มีหมุด ตรงกันทุกแถว`
          : `ไม่ตรง ${bad.length} รายการ:\n      ` + bad.slice(0, 10).join("\n      ")
      }
    }
  },
  {
    name: "ยอดที่ยกไปรวมในบิลห้องใหม่ ต้องตรงกับที่บันทึกไว้ตอนย้ายห้อง",
    why: "segment ในบิลเป็นสำเนาของยอดตอนย้าย ถ้าไม่ตรงแปลว่ามีฝั่งใดฝั่งหนึ่งถูกแก้ทีหลัง = เก็บเงินไม่ตรงกับที่คิดไว้",
    run: async () => {
      const transfers = must("ประวัติย้ายห้อง", await db.from("tenant_room_transfers")
        .select("id, from_room_number, to_room_id, billing_cycle, closing_elec_amount, closing_water_amount, include_old_room_rent, old_room_rent_amount")
        .not("closing_elec_amount", "is", null))

      if (transfers.length === 0) return { ok: true, detail: "ยังไม่มีการย้ายห้องที่คิดยอดไว้แบบใหม่" }

      const bills = must("บิลที่มีส่วนห้องเดิม", await db.from("bills")
        .select("invoice_id, room_id, billing_cycle, utility_segments")
        .not("utility_segments", "is", null))

      const bad: string[] = []
      let matched = 0
      for (const t of transfers) {
        // หาด้วย transferId ในบิลทุกใบของรอบนั้น ไม่ผูกกับ to_room_id
        // เพราะย้ายหลายครั้งในเดือนเดียว (A→B→C) ทุก segment จะไปรวมที่ห้องสุดท้ายห้องเดียว
        const cycleBills = bills.filter(b => b.billing_cycle === t.billing_cycle)
        let seg: ReturnType<typeof parseUtilitySegments>[number] | undefined
        let host: typeof cycleBills[number] | undefined
        for (const b of cycleBills) {
          const found = parseUtilitySegments(b.utility_segments).find(x => x.transferId === t.id)
          if (found) { seg = found; host = b; break }
        }
        // ยังไม่ออกบิลของห้องปลายทางในรอบนั้น = ยังไม่ถึงเวลา ไม่ใช่ความผิดพลาด
        const destBillExists = cycleBills.some(b => b.room_id === t.to_room_id)
        if (!seg || !host) {
          if (destBillExists) {
            bad.push(`รอบ ${t.billing_cycle}: ค่าน้ำ-ไฟห้อง ${t.from_room_number} ที่ย้ายออกมา ยังไม่อยู่ในบิลใบไหนเลย (ออกบิลใหม่ให้ห้องปลายทางเพื่อดึงเข้า)`)
          }
          continue
        }
        const bill = host
        matched++
        const expectedRent = t.include_old_room_rent ? Number(t.old_room_rent_amount ?? 0) : 0
        if (Math.abs(seg.elecAmount - Number(t.closing_elec_amount)) > 0.01
          || Math.abs(seg.waterAmount - Number(t.closing_water_amount ?? 0)) > 0.01
          || Math.abs(seg.rentAmount - expectedRent) > 0.01) {
          bad.push(`${bill.invoice_id}: ยอดในบิล (ไฟ ${seg.elecAmount} / น้ำ ${seg.waterAmount} / เช่า ${seg.rentAmount}) ≠ ที่บันทึกตอนย้าย (ไฟ ${t.closing_elec_amount} / น้ำ ${t.closing_water_amount} / เช่า ${expectedRent})`)
        }
      }
      return {
        ok: bad.length === 0,
        detail: bad.length === 0
          ? `เทียบ ${matched} รายการย้ายห้องกับบิลที่ออกแล้ว ตรงกันทุกรายการ`
          : `ไม่ตรง ${bad.length} รายการ:\n      ` + bad.slice(0, 10).join("\n      ")
      }
    }
  },
  {
    name: "ผู้เช่าที่ยังอยู่ต้องผูกกับห้อง",
    why: "tenants.room_id เป็นตัวที่ RLS ใช้ตัดสินว่าผู้เช่าเห็นบิลใบไหนได้",
    run: async () => {
      const { count, error } = await db.from("tenants").select("*", { count: "exact", head: true })
        .is("room_id", null)
      if (error) throw error
      return { ok: (count ?? 0) === 0, detail: `ผู้เช่าที่ไม่มีห้อง: ${count ?? 0}` }
    }
  }
]

console.log(`ตรวจฐานข้อมูล: ${dbLabel}  (อ่านอย่างเดียว)
`)

let failed = 0
for (const c of checks) {
  try {
    const r = await c.run()
    if (!r.ok) failed++
    console.log(`${r.ok ? "OK  " : "FAIL"} ${c.name}`)
    console.log(`     ${r.detail}`)
    if (!r.ok) console.log(`     เหตุผลที่ต้องเป็นแบบนั้น: ${c.why}`)
  } catch (e) {
    failed++
    console.log(`ERR  ${c.name}`)
    // error ของ PostgREST เป็น object ธรรมดา ไม่ใช่ Error — String(e) จะได้ "[object Object]"
    // ซึ่งเคยทำให้ต้องมานั่งเดาว่าคอลัมน์ไหนหาย ทั้งที่ตัวข้อความบอกไว้ครบแล้ว
    const msg = e instanceof Error
      ? e.message
      : (typeof e === "object" && e !== null && "message" in e
          ? String((e as { message?: unknown }).message)
          : JSON.stringify(e))
    console.log(`     ${msg}`)
  }
}

console.log(`\n${failed === 0 ? "ผ่านทั้งหมด" : `ไม่ผ่าน ${failed}/${checks.length} ข้อ`}`)
process.exit(failed === 0 ? 0 : 1)
