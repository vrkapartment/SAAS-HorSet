# CLAUDE.md — HorSet (หอเสร็จ)

> ไฟล์นี้คือ "คู่มือโปรเจค" สำหรับ Claude Code
> อ่านทุกครั้งก่อนเริ่มเขียนหรือแก้ไข code ใด ๆ

---

## 🏠 โปรเจคคืออะไร

**HorSet (หอเสร็จ)** — SaaS บริหารจัดการหอพัก/อพาร์ทเมนต์ครบวงจรสำหรับตลาดไทย

เป้าหมายหลัก:
- เจ้าของหอจดมิเตอร์ → สร้างบิล PDF → ผู้เช่ารับผ่าน LINE
- รองรับ PromptPay QR (EMVCo) แบบ auto-fill จำนวนเงิน
- Export รายงานภาษี ภ.ง.ด. 94 และ 90 อัปเดตทุกปี
- ระบบ Role-based Access Control (RBAC) ที่ชัดเจน

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14+ (App Router) |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS |
| Backend/DB | Supabase (PostgreSQL + Auth + RLS + Storage) |
| Deploy | Vercel |
| Notification | LINE Messaging API |
| Payment | PromptPay EMVCo QR (ไม่ใช้ Payment Gateway) |

---

## 👥 User Roles

| Role | สิทธิ์หลัก |
|---|---|
| **Admin** | ดูรายรับรายจ่าย, ดูภาษีปัจจุบัน, ดูข้อมูลทั้งหมดของหอ, จัดการ user, ต้องผ่าน 2FA |
| **Staff** | บันทึก/แก้ไขข้อมูลมิเตอร์, สั่งสร้างบิล PDF แต่ละห้อง |
| **Tenant** | ดูบิลของห้องตัวเอง, ดูข้อมูลมิเตอร์ของตัวเอง เท่านั้น |

> ⚠️ ห้าม Tenant เข้าถึงข้อมูลห้องอื่นโดยเด็ดขาด — บังคับใช้ Supabase RLS ทุก table

---

## 📁 Folder Structure

```
src/
├── app/                          # Next.js App Router (routes เท่านั้น ไม่มี logic)
│   ├── (auth)/                   # login, register
│   ├── (admin)/                  # admin dashboard
│   ├── (staff)/                  # staff pages
│   └── (tenant)/                 # tenant pages
│
├── features/                     # Business logic แยกตาม domain
│   ├── auth/                     # login, session, 2FA
│   │   ├── components/
│   │   ├── hooks/
│   │   └── actions.ts
│   ├── billing/                  # สร้างบิล, PDF, PromptPay QR
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/promptpay.ts    # EMVCo QR generator
│   │   └── actions.ts
│   ├── meter/                    # จดมิเตอร์ไฟ/น้ำ
│   │   ├── components/
│   │   ├── hooks/
│   │   └── actions.ts
│   ├── tenant/                   # ข้อมูลผู้เช่า, สัญญา
│   │   ├── components/
│   │   ├── hooks/
│   │   └── actions.ts
│   ├── room/                     # ข้อมูลห้องพัก
│   │   ├── components/
│   │   ├── hooks/
│   │   └── actions.ts
│   ├── tax/                      # ภ.ง.ด. 94, 90 export
│   │   ├── templates/            # template แยกตามปี (2024, 2025, ...)
│   │   └── actions.ts
│   └── notification/             # LINE Messaging API
│       └── actions.ts
│
├── components/
│   └── ui/                       # Shared UI components (Button, Modal, Table, Badge)
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser client
│   │   ├── server.ts             # Server client
│   │   └── middleware.ts         # Auth middleware
│   ├── promptpay.ts              # EMVCo QR utility
│   └── utils.ts                  # ฟังก์ชัน helper ทั่วไป
│
└── types/
    ├── database.ts               # Auto-generated Supabase types
    └── index.ts                  # Global TypeScript types
```

---

## 📐 Coding Rules (บังคับใช้เสมอ)

### TypeScript
- ❌ ห้ามใช้ `any` — ใช้ `unknown` แล้ว narrow type แทน
- ✅ ใช้ `type` สำหรับ object shapes, `interface` สำหรับ extendable contracts
- ✅ ทุก Supabase response ต้อง type จาก `database.ts` เสมอ

### Error Handling
- ✅ ทุก Supabase query ต้อง destructure `{ data, error }` และ handle error เสมอ
- ✅ ทุก async Server Action ต้อง wrap ใน `try/catch`
- ✅ Return type ของ Server Action ใช้ pattern: `{ success: boolean; data?: T; error?: string }`

### Security
- ❌ ห้าม hardcode ค่าใด ๆ ที่ควรอยู่ใน `.env` (API keys, URLs, secrets)
- ✅ ทุก table ใน Supabase ต้องมี RLS policy — ไม่มีข้อยกเว้น
- ✅ Admin routes ทุกหน้าต้องตรวจสอบ 2FA session ก่อนเสมอ
- ✅ ใช้ Supabase Server Client (ไม่ใช่ Browser Client) ใน Server Actions

### UI / UX
- ✅ ทุก async action ต้องมี `loading` state และ `error` state
- ✅ ใช้ Tailwind CSS เท่านั้น — ห้ามเขียน inline style หรือ CSS modules
- ✅ UI ต้องรองรับ Mobile-first (ใช้ sm:, md:, lg: breakpoints)
- ✅ ภาษาใน UI เป็นภาษาไทย

### Code Style
- ✅ ชื่อ component: `PascalCase`
- ✅ ชื่อ function/variable: `camelCase`
- ✅ ชื่อ file: `kebab-case.ts` ยกเว้น component ใช้ `PascalCase.tsx`
- ✅ Server Actions ไว้ใน `actions.ts` ของแต่ละ feature เท่านั้น
- ❌ ห้ามเขียน business logic ใน `app/` — ใส่ไว้ใน `features/` เสมอ

---

## 🗄 Database Conventions

- ชื่อ table: `snake_case` พหูพจน์ เช่น `rooms`, `meter_records`, `expenses`
- ทุก table ต้องมี column: `id uuid`, `created_at timestamptz`, `updated_at timestamptz`
- Foreign key ใช้ชื่อ `{table_singular}_id` เช่น `room_id`, `tenant_id`
- ทำ Index ที่ `billing_cycle` และ column ที่ query บ่อย
- ห้ามลบข้อมูลจริง (Hard delete) — ใช้ `deleted_at timestamptz` แทน (Soft delete)

### Tables หลัก
```
profiles          # ข้อมูล user (Admin/Staff/Tenant)
properties        # ข้อมูลหอพัก/อาคาร
rooms             # ห้องพัก
tenants           # ผู้เช่า + สัญญา
meter_records     # บันทึกมิเตอร์ไฟ/น้ำ
bills             # บิลรายเดือน
bill_items        # รายการในบิล
expenses          # รายจ่าย
```

---

## 🔐 Auth & Security

- ใช้ **Supabase Auth** (Email + Password)
- **Admin** ต้องผ่าน **2FA (TOTP)** ทุกครั้งที่ login
- Session จัดการผ่าน Supabase middleware ใน `src/lib/supabase/middleware.ts`
- Role เก็บใน `profiles.role` และอ่านผ่าน RLS policy
- ตรวจสอบ role ใน Server Action ก่อน execute ทุกครั้ง

---

## 💰 PromptPay QR (EMVCo)

- ใช้ **EMVCo QR Code template** — ไม่ผ่าน Payment Gateway ใด ๆ
- Flow: ระบบ generate QR จากเบอร์โทรที่ลงทะเบียนพร้อมเพย์ไว้ + จำนวนเงินจากบิล
- ผู้เช่าสแกน → โอนเงินผ่านแอปธนาคาร → upload slip ยืนยัน → Staff/Admin mark ชำระแล้ว
- Logic อยู่ใน `src/lib/promptpay.ts` และ `src/features/billing/utils/promptpay.ts`

---

## 📄 ภาษี ภ.ง.ด. 94 / 90

- Template แยกตามปีภาษีใน `src/features/tax/templates/`
- อัปเดต template ทุกปีเมื่อกรมสรรพากรประกาศรูปแบบใหม่
- ระบบ generate ข้อมูล "เพื่อ reference" เท่านั้น — ผู้ใช้ต้องตรวจสอบก่อนยื่นเอง
- ไม่ได้เป็นการยื่นภาษีแทนผู้ใช้

---

## 📦 Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Server-side เท่านั้น

# LINE
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=

# App
NEXT_PUBLIC_APP_URL=
```

> ❌ ห้าม commit `.env` หรือ `.env.local` ขึ้น git เด็ดขาด

---

## 🚀 Scalability Guidelines

สิ่งที่ต้องคำนึงเสมอเมื่อเพิ่ม feature ใหม่:

1. **เพิ่ม feature ใหม่ → สร้าง folder ใหม่ใน `features/`** อย่าแก้ไข feature อื่น
2. **RLS ก่อนเสมอ** — สร้าง table ใหม่ต้องเขียน RLS policy ก่อน deploy
3. **Server Actions > API Routes** — ใช้ Next.js Server Actions เป็นหลัก สร้าง API Route เฉพาะเมื่อจำเป็น (เช่น webhook LINE)
4. **ไม่ query ใน component** — ทุก data fetching อยู่ใน `hooks/` หรือ `actions.ts` เท่านั้น
5. **Tax template versioning** — ทุก template ต้องมี `year` กำกับชัดเจน

---

## 💬 วิธีคุยกับ Claude

- คุยภาษา**ไทยเป็นหลัก** — ใช้ English เฉพาะ technical terms (เช่น component, hook, query)
- เมื่อสร้าง component ใหม่ → บอก feature ที่สังกัดและ role ที่มีสิทธิ์เห็น
- เมื่อแก้ DB schema → บอกด้วยว่า RLS ควรเป็นอย่างไร
- ถ้าไม่แน่ใจ requirement → ถามก่อน อย่า assume

---

## ✅ MVP Checklist (Phase 1)

- [ ] Auth: Login + 2FA สำหรับ Admin
- [ ] Room: CRUD ห้องพัก
- [ ] Tenant: เพิ่ม/แก้ไขผู้เช่า + สัญญา
- [ ] Meter: บันทึกมิเตอร์ไฟ/น้ำ รายเดือน
- [ ] Billing: สร้างบิล + Export PDF
- [ ] PromptPay: Generate QR จากบิล
- [ ] LINE: ส่งบิลแจ้งผู้เช่าผ่าน LINE OA
- [ ] Tenant Portal: ผู้เช่าดูบิลและมิเตอร์ตัวเอง
- [ ] Tax: Export ข้อมูล ภ.ง.ด. 94/90

---

*อัปเดตไฟล์นี้ทุกครั้งที่มีการเปลี่ยนแปลง Tech Stack, Folder Structure, หรือ Business Rules หลัก*
