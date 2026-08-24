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

import { qaClient, meterUnits } from "./qa-db"

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
      const { data, error } = await db.from("bills")
        .select("invoice_id, amount, base_rent, electric_amount, water_amount, common_fee, other_service_amount, penalty_amount, vat_amount, extra_expenses")
        .not("base_rent", "is", null)
      if (error) throw error
      if (!data || data.length === 0) return { ok: true, detail: "ยังไม่มีบิลที่มี snapshot (ออกบิลใบใหม่ก่อน)" }
      const bad: string[] = []
      for (const b of data) {
        const extras = Array.isArray(b.extra_expenses)
          ? b.extra_expenses.reduce((a: number, c: { amount?: number }) => a + Number(c.amount || 0), 0) : 0
        const sum = Number(b.base_rent || 0) + Number(b.electric_amount || 0) + Number(b.water_amount || 0)
          + Number(b.common_fee || 0) + Number(b.other_service_amount || 0)
          + Number(b.penalty_amount || 0) + Number(b.vat_amount || 0) + extras
        if (Math.abs(sum - Number(b.amount || 0)) > 0.01) {
          bad.push(`${b.invoice_id}: รายการย่อย ${sum.toLocaleString()} ≠ ยอดรวม ${Number(b.amount).toLocaleString()}`)
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
    console.log(`     ${e instanceof Error ? e.message : String(e)}`)
  }
}

console.log(`\n${failed === 0 ? "ผ่านทั้งหมด" : `ไม่ผ่าน ${failed}/${checks.length} ข้อ`}`)
process.exit(failed === 0 ? 0 : 1)
