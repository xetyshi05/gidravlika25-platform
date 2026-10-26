import type { Metadata } from "next";
import localFont from "next/font/local";
import { BackofficeShell } from "@/components/backoffice-shell";
import { ConfirmationProvider } from "@/components/confirmation-dialog";
import { Toaster, TooltipLayer } from "@/components/ui";
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
    default: "Главная - Гидравлика 25 Back Office",
    template: "%s - Гидравлика 25 Back Office",
  },
  description: "Управление каталогом Гидравлика 25",
  icons: { icon: "/icon.png" },
  robots: { index: false, follow: false, noarchive: true },
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${daysOne.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipLayer />
        <Toaster />
        <ConfirmationProvider>
          <BackofficeShell>{children}</BackofficeShell>
        </ConfirmationProvider>
      </body>
    </html>
  );
}
