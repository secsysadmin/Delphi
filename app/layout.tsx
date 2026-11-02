import type { Metadata, Viewport } from "next";
import { Source_Serif_4, Work_Sans } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ScrollRestorationGuard } from "@/components/scroll-restoration-guard";
import { DEFAULT_ACCENT_COLOR } from "@/lib/utils";

type RootLayoutProps = Readonly<{ children: React.ReactNode }>;

const sans = Work_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: "SEC Registration Hub", template: "%s | SEC Registration Hub" },
  description: "Register for events from the Texas A&M Student Engineers' Council.",
  icons: {
    icon: [{ url: "/sec_favicon.png", type: "image/png", sizes: "192x192" }],
    shortcut: "/sec_favicon.png",
    apple: [{ url: "/sec_favicon.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: DEFAULT_ACCENT_COLOR,
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${sans.variable} ${serif.variable}`}>
        <ScrollRestorationGuard />
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
