import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";

const promptFont = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HorSet (หอเสร็จ) - ระบบบริหารจัดการหอพักครบวงจร",
  description: "SaaS บริหารจัดการหอพัก อพาร์ทเมนท์ จดมิเตอร์ ออกบิล แจ้งเตือนผ่าน LINE และคำนวณภาษี ภ.ง.ด. 90/94",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${promptFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-[#090e1a] text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
