import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/shared/Toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI 英語學習平台 — 香港中學英語適應性學習",
  description: "AI 驅動香港中學英語適應性學習平台，支援中一至中六學生文法、詞彙、閱讀、寫作及改錯練習，教師可派發任務、查看班級進度及覆核 AI 批改。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-HK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
