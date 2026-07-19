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
  title: "HorSet (หอเสร็จ) - ระบบบริหารจัดการหอพักครบวงจร | All-in-one dormitory management SaaS",
  description: "HorSet (หอเสร็จ) is an all-in-one SaaS platform for managing dormitories and apartments in Thailand: record electricity/water meter readings, generate PDF bills, create PromptPay QR codes for rent payments, send LINE notifications to tenants, and export tax reference reports. / ระบบ SaaS บริหารจัดการหอพัก อพาร์ทเมนท์ครบวงจร จดมิเตอร์ ออกบิล แจ้งเตือนผ่าน LINE และคำนวณภาษี ภ.ง.ด. 90/94",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192x192.png?v=3",
    shortcut: "/icon-192x192.png?v=3",
    apple: "/apple-touch-icon.png?v=3",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HorSet",
  },
  verification: {
    google: "A6xbVNIgCvYrEjat61mnsVitoQ2h6aX1vNNturgGYJg",
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
      <head>
        <link rel="icon" href="/icon-192x192.png?v=3" />
        <link rel="shortcut icon" href="/icon-192x192.png?v=3" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" />
      </head>
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



