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
        <title>Техническая ошибка — Гидравлика 25</title>
        <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; min-height: 100vh; background: #fff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
          main { display: grid; min-height: 100vh; place-items: center; padding: 32px 16px; }
          section { width: min(100%, 640px); border: 1px solid #e2e8f0; background: #f8fafc; padding: 40px; text-align: center; }
          .mark { margin: 0; color: #d1010c; font-size: 48px; font-weight: 900; line-height: 1; }
          .eyebrow { margin: 20px 0 0; color: #d1010c; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
          h1 { margin: 12px 0 0; font-size: clamp(30px, 5vw, 40px); line-height: 1.12; }
          .copy { margin: 16px auto 0; max-width: 520px; color: #475569; font-size: 16px; line-height: 1.7; }
          .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 28px; }
          button, a { display: inline-flex; min-height: 48px; align-items: center; justify-content: center; border: 1px solid #d1010c; padding: 0 24px; font: inherit; font-size: 14px; font-weight: 700; text-decoration: none; transition: background-color .2s ease, color .2s ease; }
          button { background: #d1010c; color: #fff; cursor: pointer; }
          button:hover { background: #a70009; }
          a { background: #fff; color: #d1010c; }
          a:hover { background: #fff1f2; }
          button:focus-visible, a:focus-visible { outline: 2px solid #d1010c; outline-offset: 3px; }
          @media (max-width: 480px) { section { padding: 32px 20px; } .actions { flex-direction: column; } }
        `}</style>
        <main>
          <section aria-labelledby="global-error-title">
            <p className="mark" aria-hidden="true">
              !
            </p>
            <p className="eyebrow">Техническая ошибка</p>
            <h1 id="global-error-title">Сервис временно недоступен</h1>
            <p className="copy">
              Не удалось загрузить сайт. Попробуйте ещё раз или вернитесь на главную страницу.
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
