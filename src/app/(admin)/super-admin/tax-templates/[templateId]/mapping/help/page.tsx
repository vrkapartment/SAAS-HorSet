import Link from "next/link"
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react"

const FIELD_GROUPS: { section: string; forms: string; examples: string }[] = [
  { section: "หัวฟอร์ม", forms: "90", examples: "ปีภาษีที่พิมพ์บนฟอร์ม" },
  { section: "ข้อมูลผู้เสียภาษี", forms: "90 / 94", examples: "เลขผู้เสียภาษี, ชื่อ-นามสกุล, สถานะ (บุคคล/ห้างหุ้นส่วน)" },
  { section: "ที่อยู่", forms: "90 / 94", examples: "บ้านเลขที่, หมู่, ถนน, ตำบล, อำเภอ, จังหวัด, รหัสไปรษณีย์" },
  { section: "ค่าเช่า (40(5))", forms: "90 / 94", examples: "เลขผู้จ่าย, ยอดรวม, หักแบบเหมา/หักตามจริง, ยอดสุทธิ" },
  { section: "ค่าน้ำไฟ/บริการ (40(8))", forms: "90 / 94", examples: "โครงสร้างเดียวกับค่าเช่า" },
  { section: "รายได้อื่น (40(8))", forms: "90 / 94", examples: "โครงสร้างเดียวกับค่าเช่า" },
  { section: "ใบแนบลดหย่อน", forms: "90 เท่านั้น", examples: "เลขผู้เสียภาษี, ชื่อ, ยอดลดหย่อนรายการที่ 1, ยอดรวม" },
  { section: "ข้อ 11 คำนวณภาษี", forms: "90 (25 บรรทัด) / 94 (19 บรรทัด)", examples: "บรรทัดคำนวณภาษีแต่ละข้อ รวมถึง radio “ค้างชำระ/ชำระเกิน”" },
  { section: "สรุปหน้าแรก", forms: "90 เท่านั้น", examples: "ยอดค้างชำระ, ยอดชำระเกิน" },
]

export default async function TaxTemplateMappingHelpPage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const mappingHref = `/super-admin/tax-templates/${templateId}/mapping`

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-200">
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href={mappingHref}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">วิธีใช้งาน — จัด mapping field ภ.ง.ด. 90/94</h1>
            <p className="text-xs text-slate-500">คู่มืออ้างอิงสำหรับ Super Admin เท่านั้น</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <section className="space-y-2">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            เวลากรมสรรพากรเปลี่ยนแบบฟอร์ม ภ.ง.ด. 90/94 ไฟล์ PDF ใหม่จะมีช่องกรอก (field) ในตำแหน่งและชื่อที่ต่างไปจากเดิม
            ระบบจึงไม่รู้เองว่าช่องไหนควรใส่ &quot;ชื่อผู้เสียภาษี&quot; ช่องไหนควรใส่ &quot;ยอดรายได้&quot;
            หน้า <span className="text-slate-900 dark:text-slate-100 font-semibold">จัด mapping field</span> คือเครื่องมือที่ให้คลิกบอกระบบทีละช่อง
            โดยไม่ต้องแก้โค้ดใด ๆ
          </p>
          <p className="text-sm text-slate-500 leading-relaxed">
            ทำครั้งเดียวต่อไฟล์ที่อัปโหลดหนึ่งไฟล์ หลังจากนั้นทุกครั้งที่ Admin ไปกดดาวน์โหลดแบบยื่นภาษีของผู้เช่า
            ระบบจะกรอกข้อมูลลง PDF ให้อัตโนมัติตาม mapping ที่ตั้งไว้
          </p>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">ใครใช้งานได้บ้าง</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            เฉพาะบัญชีที่มี role เป็น <span className="font-semibold text-slate-900 dark:text-slate-100">Super Admin</span> เท่านั้นที่เปิดและบันทึก mapping ได้
            Admin/Staff ทั่วไปเข้าหน้านี้ไม่ได้ แต่ยัง<span className="text-slate-900 dark:text-slate-100">อ่าน</span>ผลลัพธ์ที่ map ไว้ได้ตามปกติ
            เวลากดดาวน์โหลด PDF จริงในหน้าภาษี
          </p>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">1 · อัปโหลด PDF ต้นแบบ</h2>
          <p className="text-sm text-slate-500 mb-4">
            ทำที่หน้า <code className="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5">/super-admin</code>{" "}
            ในโซนตั้งค่าที่มีกล่อง &quot;แบบฟอร์ม PDF: ภ.ง.ด. 90&quot; และ &quot;แบบฟอร์ม PDF: ภ.ง.ด. 94&quot;
          </p>
          <ol className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">1</span>
              <span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">ภ.ง.ด. 90</span> ใช้ไฟล์เดียวร่วมกันทุกปีภาษี เลือกไฟล์แล้วอัปโหลดได้ทันที<br />
                <span className="font-semibold text-slate-900 dark:text-slate-100">ภ.ง.ด. 94</span> ต้องพิมพ์ปีภาษีก่อน (เช่น &quot;2026&quot;) แล้วกด &quot;อัปโหลด PDF สำหรับปี {"{"}ปี{"}"}&quot;
                เพราะปีภาษีถูกพิมพ์ตายตัวอยู่ในเนื้อฟอร์ม แก้ทีหลังไม่ได้
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">2</span>
              <span>ระบบตรวจไฟล์ให้อัตโนมัติ: ต้องเป็น PDF จริง และขนาดไม่เกิน 5MB</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">3</span>
              <span>
                ถ้าไฟล์ขาดช่องกรอกที่จำเป็น จะมีกล่องยืนยันเตือนจำนวนฟิลด์ที่ขาด กด &quot;ตกลง&quot; เพื่ออัปโหลดต่อได้
                (แค่แปลว่าช่องเหล่านั้นจะไม่ถูกกรอกอัตโนมัติ ไม่ใช่ข้อผิดพลาดร้ายแรง)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">4</span>
              <span>
                อัปโหลดสำเร็จจะมีปุ่ม &quot;จัด mapping field&quot; (ภ.ง.ด. 90) หรือปุ่ม &quot;mapping&quot; ในตารางรายปี (ภ.ง.ด. 94) ปรากฏขึ้น
              </span>
            </li>
          </ol>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">2 · เข้าหน้าจัด mapping field</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            กดปุ่มจากขั้นตอนก่อนหน้า ระบบจะพาไปที่หน้า mapping โดยอัตโนมัติ ไม่ต้องพิมพ์ URL เอง
            ระหว่างโหลดจะเห็นข้อความ &quot;กำลังโหลด template...&quot; เพราะระบบต้องโหลด PDF จริงมาวาดบนหน้าจอ พร้อมสแกนหาทุกช่องกรอกในไฟล์
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-900 dark:text-slate-200">ถ้ามีหลายหน้าใน PDF —</span> ด้านบนจะมีแท็บ &quot;หน้า 1&quot;, &quot;หน้า 2&quot; ... ให้กดสลับ
            ระบบจะแสดงเฉพาะหน้าที่มีช่องกรอกจริง ๆ เท่านั้น
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">3 · อ่านสีและสัญลักษณ์บนฟอร์ม</h2>
          <p className="text-sm text-slate-500 mb-4">
            ไฟล์ PDF จะถูกวาดเป็นภาพ พร้อมกรอบสีทับอยู่บนตำแหน่งช่องกรอกแต่ละช่อง สีของกรอบบอกสถานะ
          </p>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs text-slate-500 dark:text-slate-400 space-y-2.5">
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-dashed border-rose-500/70 bg-rose-500/10 align-middle mr-2" />ยังไม่ได้ map</p>
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-teal-400 bg-teal-400/15 align-middle mr-2" />map แล้ว (ช่องข้อความ)</p>
            <p><span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-400 bg-amber-400/20 align-middle mr-2" />map แล้ว (radio — ตัวเลขคือลำดับ widget)</p>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">4 · กำหนดความหมายให้แต่ละช่อง</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            ไม่มีการลากวางหรือพิมพ์พิกัด x/y — ทำได้อย่างเดียวคือ <span className="font-semibold text-slate-900 dark:text-slate-100">คลิกที่กรอบ</span> ที่ตรงกับช่องบนฟอร์มที่มองเห็น
            แล้วเลือกจาก dropdown ในกล่องที่เด้งขึ้นมา
          </p>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">Text87.15</h3>
            <p className="text-xs text-slate-500 mb-4">เลือกว่าช่องนี้ควรมีความหมายอะไร</p>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">ความหมาย</label>
            <div className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 mb-3">
              ข้อมูลผู้เสียภาษี › personal.first_name
            </div>
            <label className="text-xs text-slate-500 dark:text-slate-400 block mb-1">รูปแบบข้อมูล</label>
            <div className="w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-slate-200 mb-3">
              raw (ข้อความ/ชื่อ)
            </div>
            <div className="flex gap-2 mt-4">
              <span className="flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">ยกเลิก</span>
              <span className="flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300">ลบ mapping</span>
              <span className="flex-1 text-center px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white">บันทึก</span>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-3">
            ตัวอย่างข้างบนคือช่องข้อความ — ถ้าคลิกช่องที่เป็น radio แทน dropdown &quot;รูปแบบข้อมูล&quot; จะเปลี่ยนเป็น &quot;ตัวเลือก (option)&quot;
            เพื่อระบุว่าวงกลมนี้แทนตัวเลือกไหน (เช่น &quot;หักแบบเหมา&quot; หรือ &quot;หักตามจริง&quot;)
          </p>

          <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 mt-4 space-y-1">
            <li>ช่องข้อความ — ต้องเลือก <span className="font-semibold text-slate-900 dark:text-slate-100">ความหมาย</span> และ <span className="font-semibold text-slate-900 dark:text-slate-100">รูปแบบข้อมูล</span> (ระบบเดาให้อัตโนมัติแล้ว แก้ไขเองได้)</li>
            <li>ช่อง radio — ต้องเลือกทั้ง <span className="font-semibold text-slate-900 dark:text-slate-100">ความหมาย</span> และ <span className="font-semibold text-slate-900 dark:text-slate-100">ตัวเลือก</span></li>
          </ul>
          <p className="text-xs text-slate-500 mt-3">
            บันทึกสำเร็จตัวเลข &quot;map แล้ว X/Y&quot; มุมขวาบนจะขยับทันที ถ้าต้องการยกเลิก mapping ที่เคยตั้งไว้แล้ว ให้คลิกกรอบเดิมอีกครั้งแล้วกด &quot;ลบ mapping&quot;
            (เป็นการซ่อนออกจากระบบ ไม่ได้ลบประวัติถาวร) — ทุกครั้งที่กด &quot;บันทึก&quot; ระบบจะเก็บช่องนั้นทันที ไม่มีปุ่ม &quot;บันทึกทั้งหมด&quot; แยกต่างหาก
          </p>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">5 · กลุ่มฟิลด์ที่กำหนดได้</h2>
          <p className="text-sm text-slate-500 mb-4">
            dropdown &quot;ความหมาย&quot; จะกรองให้เห็นเฉพาะกลุ่มที่ตรงกับประเภทช่อง (ข้อความ/radio) ของกรอบที่คลิกอยู่เท่านั้น
          </p>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-3 py-2 font-semibold">กลุ่ม</th>
                  <th className="text-left px-3 py-2 font-semibold">ใช้กับ</th>
                  <th className="text-left px-3 py-2 font-semibold">ตัวอย่างความหมาย</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_GROUPS.map((row) => (
                  <tr key={row.section} className="border-b border-slate-200 dark:border-slate-800 last:border-0">
                    <td className="px-3 py-2 text-slate-900 dark:text-slate-200 font-medium whitespace-nowrap">{row.section}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.forms}</td>
                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{row.examples}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">6 · แผงสรุปความคืบหน้า</h2>
          <ul className="text-sm text-slate-600 dark:text-slate-300 list-disc pl-5 space-y-1.5">
            <li><span className="font-semibold text-slate-900 dark:text-slate-100">ตัวเลข X / Y</span> — จำนวนความหมายที่จำเป็นซึ่ง map แล้ว เทียบกับทั้งหมดของฟอร์มนี้</li>
            <li><span className="font-semibold text-amber-400">แจ้งเตือนสีอำพัน</span> &quot;มี N mapping ที่ชี้ไป field ที่ไม่มีอยู่ในไฟล์นี้แล้ว&quot; — เกิดเมื่ออัปโหลดไฟล์ใหม่ทับแล้วโครงสร้างช่องเปลี่ยนไป ต้อง map ใหม่เฉพาะจุดที่ค้าง</li>
            <li>รายการ &quot;ยังไม่ได้ map อีก N รายการ&quot; — กดเพื่อดูรายชื่อ key ที่ยังขาด (เช่น <code className="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1">item.14</code>)</li>
            <li className="flex items-center gap-1.5 text-emerald-400 font-semibold"><CheckCircle2 className="w-4 h-4 shrink-0" /> เครื่องหมายถูกสีเขียว &quot;ครบทุกรายการที่จำเป็นแล้ว&quot; — พร้อมใช้งานจริง</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">7 · ทดสอบผลลัพธ์จริง</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
            หน้า mapping <span className="font-semibold text-slate-900 dark:text-slate-100">ไม่มีปุ่มพรีวิว/สร้าง PDF ตัวอย่าง</span> — วิธีทดสอบจริงคือไปที่หน้า{" "}
            <code className="text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded px-1.5 py-0.5">ภาษี (/tax)</code> ของฝั่ง Admin
            แล้วกดปุ่มดาวน์โหลดแบบยื่นจริง ๆ ระบบจะกรอกข้อมูลตาม mapping ที่บันทึกไว้ล่าสุดทันที เปิดไฟล์ดูว่าตัวเลข/ชื่อ/ที่อยู่ลงถูกช่องหรือไม่
          </p>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">ช่องที่ยังไม่ map จะไม่ error แต่จะว่างเปล่า</span> — ถ้าลืม map ฟิลด์ไหน PDF ที่ได้จะไม่ล่ม แต่ช่องนั้นจะเว้นว่างเฉย ๆ
              ควรเช็คแผงสรุปความคืบหน้าให้ครบก่อนประกาศใช้จริง
            </span>
          </div>
        </section>

        <section>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">ข้อควรระวัง</h2>
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><span className="font-semibold">ปีภาษีของ ภ.ง.ด. 94 แก้ทีหลังไม่ได้</span> เพราะพิมพ์ตายตัวในเนื้อไฟล์ ถ้าอัปโหลดผิดปีต้องอัปโหลดไฟล์ใหม่ในปีที่ถูกต้องแทน mapping จะไม่ถูกแชร์ข้ามปีให้อัตโนมัติ</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><span className="font-semibold">ช่องอาจแสดงผิดหน้าได้ในบางไฟล์</span> ถ้าหาช่องที่ควรมีไม่เจอในแท็บที่คาดไว้ ให้ลองไล่ดูแท็บหน้าอื่น ๆ</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900 rounded-xl p-4 text-xs text-amber-800 dark:text-amber-200 flex gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span><span className="font-semibold">ฟอร์แมต &quot;comb&quot; (บาท-สตางค์) มีขนาดจำกัด</span> ถ้าตัวเลขยาวเกินจำนวนช่องในกล่องของไฟล์นั้น ระบบจะตัดหลักหน้าทิ้งให้พอดีกับกล่อง ควรเช็คไฟล์จริงหลังดาวน์โหลดหากยอดเงินมีหลักเยอะผิดปกติ</span>
            </div>
          </div>
        </section>

        <section className="pb-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">คำถามที่พบบ่อย</h2>
          <div className="space-y-4 text-sm">
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">ถ้าอัปโหลดไฟล์ผิด ต้องลบ mapping เดิมก่อนไหม</p>
              <p className="text-slate-500">ไม่ต้อง — mapping ผูกกับไฟล์แต่ละไฟล์อยู่แล้ว อัปโหลดไฟล์ใหม่จะได้หน้า mapping ใหม่ที่ว่างเปล่า ไม่กระทบ mapping ของไฟล์เดิม</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">ทำไม dropdown &quot;ความหมาย&quot; ไม่มีตัวเลือกที่ต้องการ</p>
              <p className="text-slate-500">ตรวจก่อนว่ากำลังคลิกช่องประเภทถูกไหม และตรวจว่าความหมายนั้นมีจริงในฟอร์มชนิดนี้หรือไม่ (บางความหมายมีเฉพาะ 90 หรือเฉพาะ 94)</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900 dark:text-slate-100">ต้อง map ให้ครบ 100% ก่อนใช้งานจริงได้ไหม</p>
              <p className="text-slate-500">แนะนำให้ครบ เพราะช่องที่ไม่ได้ map จะว่างในไฟล์ที่ผู้เช่าดาวน์โหลดไปยื่นจริง ควรเช็คแผงสรุปความคืบหน้าจนขึ้นเครื่องหมายถูกสีเขียวก่อนแจ้งทีมงานว่าใช้ได้</p>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-600 mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
            หมายเหตุ: ระบบสร้างข้อมูลเพื่อใช้ &quot;อ้างอิง&quot; เท่านั้น ผู้ใช้ต้องตรวจสอบความถูกต้องก่อนยื่นภาษีเองทุกครั้ง — ระบบไม่ได้ยื่นแทนผู้ใช้
          </p>
        </section>
      </div>
    </div>
  )
}
