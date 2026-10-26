import Image from "next/image";

type BrandLogoProps = {
  inverse?: boolean;
};

export function BrandLogo({ inverse = false }: BrandLogoProps) {
  return (
    <span className="flex items-center gap-2.5 sm:gap-3" aria-label="Гидравлика 25">
      <Image
        src="/icon.png"
        alt=""
        width={1254}
        height={1254}
        // Shown at 40–44 px: without `sizes` the browser gets a 1920 px copy.
        sizes="44px"
        className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
      />
      <Image
        src="/logo_text.png"
        alt=""
        width={2172}
        height={724}
        sizes="176px"
        priority
        className={`h-13 w-31 object-contain object-left sm:w-44 ${inverse ? "brightness-0 invert" : ""}`}
      />
    </span>
  );
}
