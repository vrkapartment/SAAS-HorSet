import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/translations/LanguageProvider";
import { WorkspaceDataProvider } from "@/context/WorkspaceDataContext";

const promptFont = localFont({
  src: [
    {
      path: "./fonts/Prompt/Prompt-Light.ttf",
      weight: "300",
      style: "normal",
    },
    {
      path: "./fonts/Prompt/Prompt-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Prompt/Prompt-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/Prompt/Prompt-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Prompt/Prompt-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-prompt",
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



