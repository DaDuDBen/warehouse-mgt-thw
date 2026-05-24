import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Warehouse Management",
  description: "Inventory reservation system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[#f9fafb]">
        <Providers>
          <header className="sticky top-0 z-50 border-b border-border bg-white">
            <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
              <Link
                href="/"
                className="text-sm font-semibold tracking-tight text-foreground transition-opacity hover:opacity-70"
              >
                Inventory
              </Link>
            </div>
          </header>
          <div className="flex-1">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
