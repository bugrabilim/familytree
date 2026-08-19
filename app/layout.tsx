import type { Metadata, Viewport } from "next";
import { Geist, Fraunces } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/components/ThemeToggle";
import { LanguageProvider } from "@/lib/i18n";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const DESC =
  "Ailenizin soy ağacını birlikte oluşturun. Kuşakları görselleştirin, anıları ve fotoğrafları saklayın; GEDCOM, e-Devlet ve yapay zekâ ile içe aktarın.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: `${SITE_NAME} — Ailenin hikâyesi`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESC,
  keywords: [
    "soy ağacı", "aile ağacı", "şecere", "soyağacı", "GEDCOM", "e-Devlet",
    "aile kitabı", "genealogy", "family tree", "kuşak", "akrabalık",
  ],
  authors: [{ name: SITE_NAME }],
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "tr_TR",
    url: "/",
    title: `${SITE_NAME} — Hiçbir hikâye kaybolmasın`,
    description: DESC,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Hiçbir hikâye kaybolmasın`,
    description: DESC,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#12140f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`${geistSans.variable} ${fraunces.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-text">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
