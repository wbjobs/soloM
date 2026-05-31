import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Layout from "@/components/Layout";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAG 知识库助手",
  description: "基于 RAG 技术的智能问答系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased font-sans bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100`}
      >
        <Layout>{children}</Layout>
      </body>
    </html>
  );
}
