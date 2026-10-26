import type { Metadata } from "next";
import localFont from "next/font/local";
import { CrmShell } from "@/components/crm-shell";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const manrope = localFont({
  src: "../../../../packages/shared/assets/fonts/Manrope-VariableFont_wght.woff2",
  variable: "--font-manrope",
  display: "swap",
  weight: "100 900",
});

const daysOne = localFont({
  src: "../../../../packages/shared/assets/fonts/DaysOne-Regular.woff2",
  variable: "--font-days-one",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Главная - Гидравлика 25 CRM",
    template: "%s - Гидравлика 25 CRM",
  },
  description: "Рабочее пространство отдела продаж",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "1254x1254" },
    ],
  },
  robots: { index: false, follow: false, noarchive: true },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  return (
    <html lang="ru" className={`${manrope.variable} ${daysOne.variable} h-full antialiased`}>
      <body className="min-h-full">
        <CrmShell user={user}>{children}</CrmShell>
      </body>
    </html>
  );
}
