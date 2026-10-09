import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/shared/Toast";
import AuthProvider from "@/components/shared/AuthProvider";
import { HydrateStore } from "@/components/shared/HydrateStore";
import { GlobalErrorBoundary } from "@/components/shared/GlobalErrorBoundary";
import { cookies } from "next/headers";
import { t } from "@/shared/utils/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: t('layout.title'),
    template: "%s | AI English Platform",
  },
  description: t('layout.description'),
  manifest: '/manifest.json',
  /**
   * 封鎖瀏覽器自動翻譯（Chrome／Edge／Google 翻譯）。
   *
   * 2026-09-23 稽核：瀏覽器翻譯會把文字節點包進 <font> 並改寫父子關係，
   * 令 React 之後的 removeChild 拋出
   * "Failed to execute 'removeChild' on 'Node': The node to be removed is not a
   * child of this node."（實測：錯誤頁被翻成簡體中文後，整個 App 被錯誤邊界接住）。
   *
   * 平台不依賴瀏覽器翻譯：介面語言由 lang cookie + i18n 決定，題目翻譯走自家
   * /api/ai/translate。機器翻譯亦會破壞 DSE 篇章的行號排版與答案比對，
   * 因此 app shell 明確封鎖（meta 為 Google 官方訊號，translate="no" 為 HTML 標準）。
   */
  other: { google: 'notranslate' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'AI English',
  },
  icons: {
    apple: '/icons/icon-180.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Dynamically set html lang based on user's language cookie
  const cookieStore = await cookies();
  const langCookie = cookieStore.get('lang')?.value;
  const htmlLang = langCookie === 'en' ? 'en' : 'zh-HK';

  return (
    <html
      lang={htmlLang}
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100" suppressHydrationWarning>
        <AuthProvider>
          <ToastProvider>
            <HydrateStore />
            <GlobalErrorBoundary>
              {children}
            </GlobalErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
