import { Photo } from "@/components/ui/photo";
import type { Metadata } from "next";
import { getSiteMedia } from "@/lib/catalog-api";
import { loadSiteMedia, productionPhotos } from "@/lib/site-media";
import { createPageMetadata } from "@/lib/site";

export const metadata: Metadata = createPageMetadata({
  title: "Производственная площадка",
  description: "Фотографии производственной площадки Гидравлика 25 в Орле.",
  path: "/production",
});

export default async function ProductionPage() {
  const photos = productionPhotos(await loadSiteMedia(getSiteMedia));
  return (
    <main className="bg-white p-4 sm:p-6 lg:p-8">
      <h1 className="sr-only">Производственная площадка</h1>
      {photos.length ? (
        <section
          aria-label="Фотографии производственной площадки"
          className="mx-auto grid max-w-360 gap-4 sm:grid-cols-2 sm:gap-6"
        >
          {photos.map((photo, index) => (
            <figure key={photo.src} className="relative aspect-4/3 overflow-hidden bg-slate-100">
              <Photo
                src={photo.src}
                alt={photo.alt}
                fill
                priority={index === 0}
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </figure>
          ))}
        </section>
      ) : (
        <p className="mx-auto max-w-360 py-16 text-center text-base text-slate-600">
          Фотографии производственной площадки скоро появятся.
        </p>
      )}
    </main>
  );
}
