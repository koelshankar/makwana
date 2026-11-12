import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TabGuard } from "@/components/shell/tab-guard";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Makwana Kitchen Configurator",
  description: "Demo kitchen configurator for Makwana Modular Kulture",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <TooltipProvider delay={200}>
          <TabGuard>{children}</TabGuard>
        </TooltipProvider>
        <Toaster theme="light" position="bottom-center" offset={{ bottom: 88 }} />
      </body>
    </html>
  );
}
