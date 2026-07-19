import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/shared/Toast";
import AuthProvider from "@/components/shared/AuthProvider";
import { HydrateStore } from "@/components/shared/HydrateStore";
import { GlobalErrorBoundary } from "@/components/shared/GlobalErrorBoundary";
import { headers } from "next/headers";
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
