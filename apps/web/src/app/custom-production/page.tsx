import { CustomProduction } from "@/components/home/custom-production";
import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Изготовление гидроцилиндров на заказ",
  description:
    "Изготовление гидроцилиндров по индивидуальным размерам и чертежам. Обсудим параметры, сроки производства и доставку.",
  path: "/custom-production",
});

export default function CustomProductionPage() {
  return <CustomProduction />;
}
