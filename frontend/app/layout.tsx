import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { MarketProvider } from "@/components/MarketProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MarketProvider>{children}</MarketProvider>
      </body>
    </html>
  );
}
