import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { MarketProvider } from "@/components/MarketProvider";
import "./globals.css";

// Inter for UI text; JetBrains Mono strictly for data values.
// (variable name kept for token compatibility in globals.css)
const inter = Inter({
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: browser extensions (Grammarly et al.)
          inject attributes into <body> before React hydrates — harmless,
          but React treats it as a server/client mismatch without this. */}
      <body className="min-h-full" suppressHydrationWarning>
        <MarketProvider>
          <AppShell>{children}</AppShell>
        </MarketProvider>
      </body>
    </html>
  );
}
