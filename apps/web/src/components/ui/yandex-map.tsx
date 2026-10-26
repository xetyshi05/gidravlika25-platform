"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import {
  getServerCookieConsent,
  readCookieConsent,
  saveCookieConsent,
  subscribeCookieConsent,
} from "@/lib/cookie-consent";

type Coordinates = readonly [number, number];

type MapEntity = {
  addChild: (child: MapEntity) => MapEntity;
  destroy?: () => void;
};

type YandexMapsApi = {
  ready: Promise<void>;
  YMap: new (
    container: HTMLElement,
    props: { location: { center: Coordinates; zoom: number } },
  ) => MapEntity;
  YMapDefaultSchemeLayer: new () => MapEntity;
  YMapDefaultFeaturesLayer: new (props?: Record<string, never>) => MapEntity;
  YMapMarker: new (props: { coordinates: Coordinates }, element: HTMLElement) => MapEntity;
};

declare global {
  interface Window {
    ymaps3?: YandexMapsApi;
  }
}

type YandexMapProps = {
  coordinates: Coordinates;
  center?: Coordinates;
  label: string;
  className?: string;
  zoom?: number;
};

const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

function createMarker() {
  const marker = document.createElement("div");
  marker.setAttribute("aria-hidden", "true");
  marker.style.cssText =
    "display:grid;place-items:center;width:44px;height:44px;border:2px solid #ffffff;border-radius:9999px;background:#ffffff;box-shadow:0 3px 14px rgba(15,23,42,.28);transform:translate(-50%,-50%);";

  const logo = document.createElement("img");
  logo.src = "/icon.png";
  logo.alt = "";
  logo.style.cssText = "width:28px;height:28px;object-fit:contain;";
  marker.appendChild(logo);

  return marker;
}

function observeMapAccessibility(container: HTMLElement) {
  const updateGeneratedElements = () => {
    container.querySelectorAll<HTMLImageElement>("img:not([alt])").forEach((image) => {
      image.alt = "";
    });
    container
      .querySelectorAll<HTMLAnchorElement>("a.ymaps3--map-copyrights__logo")
      .forEach((link) => {
        link.setAttribute("aria-label", "Открыть Яндекс Карты");
      });
  };
  const observer = new MutationObserver(updateGeneratedElements);
  observer.observe(container, { childList: true, subtree: true });
  updateGeneratedElements();
  return observer;
}

export function YandexMap({
  coordinates,
  center = coordinates,
  label,
  className,
  zoom = 15,
}: YandexMapProps) {
  const consent = useSyncExternalStore(
    subscribeCookieConsent,
    readCookieConsent,
    getServerCookieConsent,
  );
  const mapLink = createMapLink(coordinates, zoom);

  if (consent !== "all") {
    return (
      <div className={`grid place-items-center bg-slate-50 p-6 text-center ${className ?? ""}`}>
        <div className="max-w-sm">
          <p className="text-sm font-bold text-slate-800">Карта: {label}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Разрешите сторонние cookie, чтобы загрузить интерактивную карту Яндекса.
          </p>
          <button
            type="button"
            onClick={() => saveCookieConsent("all")}
            className="mt-4 min-h-10 rounded border border-brand bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            Разрешить и показать карту
          </button>
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-sm font-bold text-brand underline decoration-brand/40 underline-offset-4 hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            Открыть без встраивания
          </a>
        </div>
      </div>
    );
  }

  return (
    <ConsentedYandexMap
      coordinates={coordinates}
      center={center}
      label={label}
      className={className}
      zoom={zoom}
    />
  );
}

function ConsentedYandexMap({
  coordinates,
  center = coordinates,
  label,
  className,
  zoom = 15,
}: YandexMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const accessibilityObserverRef = useRef<MutationObserver | null>(null);
  const mapRef = useRef<MapEntity | null>(null);
  const [failedToLoad, setFailedToLoad] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const initializeMap = useCallback(async () => {
    const container = containerRef.current;
    const maps = window.ymaps3;

    if (!container || !maps || initializedRef.current) {
      return;
    }

    initializedRef.current = true;

    try {
      await maps.ready;
      const map = new maps.YMap(container, {
        location: { center, zoom },
      });
      mapRef.current = map;

      map
        .addChild(new maps.YMapDefaultSchemeLayer())
        .addChild(new maps.YMapDefaultFeaturesLayer())
        .addChild(new maps.YMapMarker({ coordinates }, createMarker()));
      accessibilityObserverRef.current?.disconnect();
      accessibilityObserverRef.current = observeMapAccessibility(container);
      setIsReady(true);
    } catch {
      initializedRef.current = false;
      setFailedToLoad(true);
    }
  }, [center, coordinates, zoom]);

  useEffect(
    () => () => {
      accessibilityObserverRef.current?.disconnect();
      mapRef.current?.destroy?.();
    },
    [],
  );

  const mapLink = createMapLink(coordinates, zoom);

  if (!apiKey || failedToLoad) {
    return (
      <div className={`grid place-items-center bg-slate-50 p-6 text-center ${className ?? ""}`}>
        <div>
          <p className="text-sm font-bold text-slate-800">Карта: {label}</p>
          <a
            href={mapLink}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex text-sm font-bold text-brand underline decoration-brand/40 underline-offset-4 transition-colors hover:text-brand-dark focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            Открыть в Яндекс Картах
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`relative bg-slate-50 ${className ?? ""}`}>
        <div
          ref={containerRef}
          role="region"
          aria-label={`Карта: ${label}`}
          className="absolute inset-0"
        />
        {!isReady ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <LoadingSpinner label="Загружаем карту" />
          </div>
        ) : null}
      </div>
      <Script
        id="yandex-maps-api"
        src={`https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`}
        strategy="afterInteractive"
        onReady={() => {
          void initializeMap();
        }}
        onError={() => setFailedToLoad(true)}
      />
    </>
  );
}

function createMapLink(coordinates: Coordinates, zoom: number) {
  return `https://yandex.ru/maps/?ll=${coordinates[0]}%2C${coordinates[1]}&z=${zoom}&pt=${coordinates[0]},${coordinates[1]},pm2rdm`;
}
