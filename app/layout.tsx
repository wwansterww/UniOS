import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import { Toaster } from "sonner";
import { I18nProvider } from "@/components/i18n";
import { ServiceWorker } from "@/components/service-worker";
import { currentLocale } from "@/lib/auth";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic", "cyrillic-ext"] });
// Headings: Inter Tight. cyrillic-ext covers Kazakh letters.
const display = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin", "cyrillic", "cyrillic-ext"] });

export const metadata: Metadata = {
  // Absolute links for link previews (the logo image) point at the deployed site.
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: { default: "UniOS", template: "%s · UniOS" },
  description: "Расписание, дедлайны и объявления Нархоза — в одном месте",
  appleWebApp: { capable: true, title: "UniOS", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  // Link previews (Telegram, WhatsApp…) show the university logo.
  openGraph: { title: "UniOS · Narxoz University", siteName: "UniOS", images: [{ url: "/brand/narxoz-square.png", width: 447, height: 447 }] },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Sets the theme class before first paint, so there is no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await currentLocale();
  return (
    <html lang={locale} className={`${inter.variable} ${display.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <I18nProvider locale={locale}>
          {children}
          <Toaster position="top-center" richColors closeButton />
          <ServiceWorker />
        </I18nProvider>
      </body>
    </html>
  );
}
