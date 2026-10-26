import type { Metadata } from "next";
import localFont from "next/font/local";
import { CartProvider } from "@/components/cart/cart-provider";
import { Footer } from "@/components/layout/footer";
import { CookieBanner } from "@/components/layout/cookie-banner";
import { Header } from "@/components/layout/header";
import { ScrollToTop } from "@/components/layout/scroll-to-top";
import { JsonLd } from "@/components/seo/json-ld";
import { defaultSocialImage, siteUrl } from "@/lib/site";
import "./globals.css";

const manrope = localFont({
  src: "../../../../packages/shared/assets/fonts/Manrope-VariableFont_wght.woff2",
  variable: "--font-manrope",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Гидроцилиндры от производителя — Гидравлика 25",
    template: "%s — Гидравлика 25",
  },
  description:
    "Готовые гидроцилиндры со склада и изготовление по индивидуальным параметрам с доставкой по России.",
  applicationName: "Гидравлика 25",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Гидравлика 25",
    title: "Гидроцилиндры от производителя — Гидравлика 25",
    description:
      "Готовые гидроцилиндры со склада и изготовление по индивидуальным параметрам с доставкой по России.",
    url: "/",
    images: [defaultSocialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: "Гидроцилиндры от производителя — Гидравлика 25",
    description:
      "Готовые гидроцилиндры со склада и изготовление по индивидуальным параметрам с доставкой по России.",
    images: [defaultSocialImage.url],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "1254x1254" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-white">
        <a href="#main-content" className="a11y-skip-link">
          Перейти к основному содержимому
        </a>
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "Organization",
                "@id": `${siteUrl}/#organization`,
                name: "Гидравлика 25",
                legalName: "ООО «ГИДРАВЛИКА 25»",
                url: siteUrl,
                logo: `${siteUrl}/logo.png`,
                email: "info@gidravlika25.ru",
                telephone: ["+7-929-918-51-47", "+7-925-385-84-21"],
                taxID: "5700012184",
                areaServed: "RU",
                address: [
                  {
                    "@type": "PostalAddress",
                    postalCode: "302008",
                    addressLocality: "Орёл",
                    addressRegion: "Орловская область",
                    streetAddress: "ул. Машиностроительная, зд. 8/1",
                    addressCountry: "RU",
                  },
                  {
                    "@type": "PostalAddress",
                    postalCode: "141006",
                    addressLocality: "Мытищи",
                    addressRegion: "Московская область",
                    streetAddress: "Олимпийский проспект, 40, к. 3",
                    addressCountry: "RU",
                  },
                ],
                contactPoint: [
                  {
                    "@type": "ContactPoint",
                    telephone: "+7-929-918-51-47",
                    contactType: "sales",
                    areaServed: "RU",
                    availableLanguage: "Russian",
                  },
                  {
                    "@type": "ContactPoint",
                    telephone: "+7-925-385-84-21",
                    contactType: "customer service",
                    areaServed: "RU",
                    availableLanguage: "Russian",
                  },
                ],
              },
              {
                "@type": "WebSite",
                "@id": `${siteUrl}/#website`,
                url: siteUrl,
                name: "Гидравлика 25",
                inLanguage: "ru-RU",
                publisher: { "@id": `${siteUrl}/#organization` },
              },
            ],
          }}
        />
        <CartProvider>
          <Header />
          <ScrollToTop />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
          <CookieBanner />
        </CartProvider>
      </body>
    </html>
  );
}
