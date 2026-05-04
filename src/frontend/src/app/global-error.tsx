"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught an error:", error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body className="m-0">
        <div
          className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8fbff_0%,_#eef4f7_46%,_#f8fafc_100%)] px-4"
          dir="rtl"
        >
          <div className="w-full max-w-xl rounded-[28px] border border-rose-100 bg-white p-8 text-right shadow-[0_24px_80px_-32px_rgba(15,23,42,0.28)]">
            <div className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              שגיאה כללית
            </div>
            <h1 className="mt-4 text-3xl font-bold text-slate-900">האפליקציה נתקלה בתקלה</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              משהו קרה ברמת האפליקציה כולה. אפשר לנסות לאתחל מחדש, ואם צריך לחזור למסך הבית.
            </p>

            {error?.message && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                {error.message}
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                נסה שוב
              </button>
              <button
                type="button"
                onClick={() => window.location.assign("/")}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                לדף הבית
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
