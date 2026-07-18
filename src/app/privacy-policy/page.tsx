import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "นโยบายความเป็นส่วนตัว | HorSet",
  description: "นโยบายความเป็นส่วนตัวของระบบ HorSet (หอเสร็จ)"
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> กลับหน้าแรก
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold mb-2">นโยบายความเป็นส่วนตัว</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-10">
          HorSet (หอเสร็จ) — มีผลบังคับใช้ตั้งแต่วันที่ 18 กรกฎาคม 2569
        </p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <p>
              HorSet ("เรา", "ระบบ") ให้บริการซอฟต์แวร์บริหารจัดการหอพัก/อพาร์ทเมนต์แก่เจ้าของหอพักและผู้ดำเนินการ
              ("ผู้ให้บริการหอพัก") นโยบายนี้อธิบายว่าเราเก็บ ใช้ และดูแลข้อมูลส่วนบุคคลของผู้ใช้งานระบบอย่างไร
              โดยยึดตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ของประเทศไทย
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">ข้อมูลที่เราเก็บรวบรวม</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>ข้อมูลบัญชีผู้ใช้</strong> — ชื่อ-นามสกุล, อีเมล, เบอร์โทรศัพท์, บทบาทการใช้งาน (เจ้าของหอ/พนักงาน/ผู้เช่า)</li>
              <li><strong>ข้อมูลผู้เช่าและสัญญา</strong> — ข้อมูลติดต่อ, รายละเอียดห้องพัก, ระยะเวลาสัญญาเช่า ที่เจ้าของหอพักเป็นผู้กรอกเข้าระบบ</li>
              <li><strong>ข้อมูลมิเตอร์และบิล</strong> — ค่ามิเตอร์ไฟ/น้ำรายเดือน, รายการบิล, ประวัติการชำระเงิน</li>
              <li><strong>รูปภาพสลิปการโอนเงิน</strong> — ที่ผู้เช่าอัปโหลดเพื่อยืนยันการชำระค่าเช่า</li>
              <li><strong>LINE User ID</strong> — ใช้เพื่อส่งข้อความแจ้งเตือนบิลผ่าน LINE Official Account เท่านั้น (กรณีเปิดใช้งานฟีเจอร์นี้)</li>
              <li><strong>คุกกี้ในการใช้งาน</strong> — ใช้เก็บสถานะการเข้าสู่ระบบและสิทธิ์การใช้งาน (session) เท่านั้น ไม่ใช้เพื่อการโฆษณา</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">วิธีที่เราจัดเก็บและปกป้องข้อมูล</h2>
            <p>
              ข้อมูลทั้งหมดจัดเก็บบนฐานข้อมูล Supabase (PostgreSQL) พร้อมมาตรการ Row Level Security (RLS)
              ที่จำกัดสิทธิ์การเข้าถึงตามบทบาทผู้ใช้อย่างเคร่งครัด — ผู้เช่าสามารถเห็นได้เฉพาะข้อมูลของห้องตนเองเท่านั้น
              รูปภาพสลิปจัดเก็บผ่าน Supabase Storage แบบจำกัดสิทธิ์การเข้าถึงเช่นเดียวกัน ระบบ deploy อยู่บน Vercel
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">การเปิดเผยข้อมูลให้บุคคลที่สาม</h2>
            <p className="mb-2">เราแบ่งปันข้อมูลเท่าที่จำเป็นกับผู้ให้บริการต่อไปนี้ เพื่อให้ฟีเจอร์ของระบบทำงานได้:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>LINE Messaging API</strong> — ส่งข้อความแจ้งเตือนบิลถึงผู้เช่าที่ผูก LINE ไว้แล้ว</li>
              <li><strong>SlipOK</strong> — ตรวจสอบความถูกต้องของสลิปโอนเงินอัตโนมัติ (เฉพาะหอพักที่เปิดใช้งานฟีเจอร์นี้)</li>
              <li><strong>Google (Sign in with Google)</strong> — สำหรับผู้ใช้ที่เลือกเข้าสู่ระบบ/สมัครสมาชิกผ่านบัญชี Google</li>
            </ul>
            <p className="mt-2">
              เราไม่ขายหรือให้เช่าข้อมูลส่วนบุคคลของผู้ใช้แก่บุคคลที่สามเพื่อวัตถุประสงค์ทางการตลาด
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">สิทธิของเจ้าของข้อมูล</h2>
            <p>
              ผู้ใช้มีสิทธิขอเข้าถึง แก้ไข หรือขอให้ลบข้อมูลส่วนบุคคลของตนได้ โดยติดต่อผู้ดูแลระบบของหอพักที่ท่านพักอาศัยอยู่
              (เจ้าของหอพักเป็นผู้ควบคุมข้อมูล/Data Controller ของข้อมูลผู้เช่าในระบบ) หรือติดต่อทีมงาน HorSet โดยตรง
              ตามช่องทางที่ระบุไว้ในหน้า "ติดต่อเรา"
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">ระยะเวลาการเก็บข้อมูล</h2>
            <p>
              เราเก็บข้อมูลไว้ตราบเท่าที่บัญชีของหอพักยังใช้งานระบบอยู่ และตามระยะเวลาที่กฎหมายกำหนด (เช่น เอกสารบัญชี/ภาษี)
              หากหอพักยกเลิกการใช้บริการ ข้อมูลจะถูกลบหรือทำให้ไม่สามารถระบุตัวตนได้ภายในระยะเวลาที่เหมาะสม
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold mb-3">การเปลี่ยนแปลงนโยบาย</h2>
            <p>
              เราอาจปรับปรุงนโยบายนี้เป็นครั้งคราว การเปลี่ยนแปลงที่มีนัยสำคัญจะแจ้งให้ผู้ใช้ทราบผ่านหน้าเว็บไซต์
            </p>
          </section>

          <section className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            เอกสารนี้จัดทำขึ้นเพื่อความโปร่งใสในการใช้งานระบบเบื้องต้น ไม่ถือเป็นคำแนะนำทางกฎหมาย
            ผู้ให้บริการหอพักที่นำระบบไปใช้ควรปรึกษาที่ปรึกษากฎหมายเพื่อปรับเนื้อหาให้เหมาะสมกับการดำเนินธุรกิจของตนก่อนเผยแพร่จริง
          </section>
        </div>
      </div>
    </main>
  )
}
