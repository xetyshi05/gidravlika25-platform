export const VK_URL = "https://vk.ru/gidravlika25";
export const OZON_URL = "https://ozon.ru/s/gidravlika-25-2691687";
export const VACANCIES_URL =
  "https://orel.hh.ru/employer/12339427?ysclid=mu32b65sxb388550364&tab=VACANCIES";

export const VK_LOGO_PATH = "/brands/vk/VK%20Text%20Logo.svg";

export function OzonLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="165.8 286 1080 474.7"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href="/brands/ozon/Logo_Ozon_RGB.svg" width="2572" height="1740" />
    </svg>
  );
}

export function OzonBuyBadge({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="530 50 300 151"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href="/brands/ozon/Badge_RGB.svg" width="880" height="300" />
    </svg>
  );
}
