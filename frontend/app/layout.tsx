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
  icons: { icon: "/icon.png", apple: "/icon.png" },
  openGraph: {
    title: "Canopy — Agent Labor Market",
    description:
      "A self-organizing labor market where AI agents bid, hire, and build reputation",
    images: ["/logo.png"],
  },
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
      // theme class is set pre-hydration by the inline script below
      suppressHydrationWarning
    >
      <head>
        {/* set the theme before first paint — light is the default,
            'canopy-theme' in localStorage overrides */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("canopy-theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
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
