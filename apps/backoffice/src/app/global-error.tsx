"use client";

import Link from "next/link";

type GlobalErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

export default function GlobalError({ retry }: GlobalErrorProps) {
  return (
    <html lang="ru">
      <body>
        <title>Техническая ошибка — Гидравлика 25 Back Office</title>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; background: #111315; color: #f4f4f5; font-family: Arial, Helvetica, sans-serif; }
          main { display: grid; min-height: 100vh; place-items: center; padding: 32px 16px; }
          section { width: min(100%, 640px); border: 1px solid #343940; border-radius: 6px; background: #1d2024; padding: 40px; text-align: center; }
          .mark { margin: 0; color: #d1010c; font-size: 48px; font-weight: 900; line-height: 1; }
          .eyebrow { margin: 20px 0 0; color: #d1010c; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
          h1 { margin: 12px 0 0; font-size: clamp(28px, 5vw, 38px); line-height: 1.15; }
          .copy { margin: 16px auto 0; max-width: 520px; color: #969da7; font-size: 16px; line-height: 1.65; }
          .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 28px; }
          button, a { display: inline-flex; min-height: 46px; align-items: center; justify-content: center; border-radius: 6px; padding: 0 22px; font: inherit; font-size: 14px; font-weight: 700; text-decoration: none; transition: background-color .2s ease, border-color .2s ease, color .2s ease; }
          button { border: 1px solid #d1010c; background: #d1010c; color: #fff; cursor: pointer; }
          button:hover { background: #a70009; }
          a { border: 1px solid #343940; background: #25292e; color: #f4f4f5; }
          a:hover { border-color: #d1010c; color: #d1010c; }
          button:focus-visible, a:focus-visible { outline: 2px solid #d1010c; outline-offset: 3px; }
          @media (max-width: 480px) { section { padding: 32px 20px; } .actions { flex-direction: column; } }
        `}</style>
        <main>
          <section aria-labelledby="global-error-title">
            <p className="mark" aria-hidden="true">
              !
            </p>
            <p className="eyebrow">Ошибка Back Office</p>
            <h1 id="global-error-title">Back Office временно недоступен</h1>
            <p className="copy">
              Не удалось загрузить панель управления. Попробуйте ещё раз или вернитесь на главную
              страницу.
            </p>
            <div className="actions">
              <button type="button" onClick={retry}>
                Попробовать ещё раз
              </button>
              <Link href="/">На главную</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
