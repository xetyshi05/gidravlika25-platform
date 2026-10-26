import { AboutCompany } from "@/components/home/about-company";
import { Hero } from "@/components/home/hero";
import { ProductSelector } from "@/components/home/product-selector";
import { Wholesale } from "@/components/home/wholesale";
import { getSiteMedia } from "@/lib/catalog-api";
import { homeMedia, loadSiteMedia } from "@/lib/site-media";

export default async function Home() {
  const { heroImage, gallerySlides } = homeMedia(await loadSiteMedia(getSiteMedia));
  return (
    <>
      <Hero imagePath={heroImage} />
      <ProductSelector />
      <AboutCompany showIntro gallerySlides={gallerySlides} />
      <Wholesale />
    </>
  );
}
