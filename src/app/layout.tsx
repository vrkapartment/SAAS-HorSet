import type { Metadata, Viewport } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/translations/LanguageProvider";
import { WorkspaceDataProvider } from "@/context/WorkspaceDataContext";

const promptFont = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "HorSet (หอเสร็จ) - ระบบบริหารจัดการหอพักครบวงจร",
  description: "SaaS บริหารจัดการหอพัก อพาร์ทเมนท์ จดมิเตอร์ ออกบิล แจ้งเตือนผ่าน LINE และคำนวณภาษี ภ.ง.ด. 90/94",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HorSet",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
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
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans antialiased">
        <ThemeProvider>
          <LanguageProvider>
            <WorkspaceDataProvider>
              {children}
            </WorkspaceDataProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}



