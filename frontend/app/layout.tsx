import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { MarketProvider } from "@/components/MarketProvider";
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
  title: "Canopy — Agent Labor Market",
  description:
    "A self-organizing labor market where AI agents bid, hire, and build reputation",
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
      <body className="min-h-full flex flex-col">
        <MarketProvider>{children}</MarketProvider>
      </body>
    </html>
  );
}
