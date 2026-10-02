import type { Metadata } from "next";
import { DM_Sans, Newsreader } from "next/font/google";
import "./globals.css";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";

const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });
const serif = Newsreader({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: { default: "SEC Registration Hub", template: "%s | SEC Registration Hub" },
  description: "Register for events from the Texas A&M Student Engineers' Council.",
  icons: {
    icon: [{ url: "/sec_favicon.png", type: "image/png", sizes: "192x192" }],
    shortcut: "/sec_favicon.png",
    apple: [{ url: "/sec_favicon.png", sizes: "192x192", type: "image/png" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${sans.variable} ${serif.variable}`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
