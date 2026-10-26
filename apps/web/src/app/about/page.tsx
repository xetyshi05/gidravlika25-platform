import { AboutCompany } from "@/components/home/about-company";
import { PageIntro } from "@/components/layout/page-intro";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "О компании",
  description:
    "Производство гидроцилиндров Магистр в Орле с 2012 года. Поставляем серийные изделия и выполняем заказы по индивидуальным параметрам.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="О компании"
        title="Производим и поставляем гидроцилиндры с 2012 года"
        description="ООО «Гидравлика 25» производит гидроцилиндры в Орле и поставляет их клиентам по всей России."
      />
      <AboutCompany />
    </>
  );
}
