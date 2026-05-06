"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

type ReminderItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  cta: string;
};

const REMINDERS: ReminderItem[] = [
  {
    id: "academic-year",
    title: "יצירת שנה\"ל בטאב השנים",
    description: "לפני כל שיבוץ חדש יש לפתוח שנת לימודים חדשה ולעדכן אותה כפעילה במסך השנים.",
    href: "/academic-years",
    cta: "למסך השנים",
  },
  {
    id: "homerooms",
    title: "שיבוץ כיתות אם בכיתות המיועדות להן",
    description: "לאחר פתיחת השנה יש לוודא שלכל כיתת אם יש חדר אם מעודכן ונכון לשנה החדשה.",
    href: "/homerooms",
    cta: "למסך כיתות אם",
  },
  {
    id: "study-groups",
    title: "יצירת קבוצות הקבצות במתמטיקה ואז באנגלית ושיבוצן",
    description: "מומלץ להתחיל בהקבצות מתמטיקה, לאחר מכן באנגלית, ואז לבצע שיבוץ ולעבור על חריגים.",
    href: "/study-groups",
    cta: "למסך ההקבצות",
  },
  {
    id: "tracks",
    title: "תזכורת למסלולים: מי שרוצה לתפוס חדר, זה הזמן",
    description: "כדאי לעדכן את הצוותים והמסלולים שזה החלון המתאים לבקשות חדרים ולתפיסת משאבים קבועים.",
    href: "/room-request",
    cta: "למסך בקשות חדר",
  },
  {
    id: "tracks-update-hours",
    title: "תזכורת למסלול התעמלות ולמסלול מוזיקה לעדכון שעות השימוש",
    description: "יש להזכיר למסלול התעמלות ולמסלול מוזיקה לעדכן את השעות שבהן האולם וחדר המוזיקה נמצאים בשימוש, כדי שהמערכת תשקף זמינות נכונה.",
    href: "/auditorium",
    cta: "למסך האולם",
  },
  {
    id: "high-school-pe-room-request",
    title: "תזכורת לשיבוץ שיעורי התעמלות תיכון בטאב בקשת חדר",
    description: "יש לבצע שיבוץ לשיעורי התעמלות תיכון דרך טאב בקשת חדר, כדי לוודא שהם נכנסים לתהליך הבקשות והאישורים בצורה מסודרת.",
    href: "/room-request",
    cta: "למסך בקשת חדר",
  },
];

export default function YearStartRemindersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (!session) {
      router.push("/login");
    }
  }, [router, session, status]);

  if (status === "loading") {
    return <div className="min-h-screen bg-gray-50 p-8 text-center">טוען...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-3xl bg-gradient-to-l from-amber-100 via-white to-sky-100 shadow-sm ring-1 ring-slate-200">
          <div className="px-6 py-8 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="inline-flex rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                  פתיחת שנה
                </span>
                <h1 className="mt-3 text-3xl font-bold text-slate-900">תזכורות לעדכון בתחילת שנה</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  ריכוז קצר של המשימות שכדאי לבצע בתחילת שנת הלימודים, עם קישורים ישירים למסכים הרלוונטיים במערכת.
                </p>
              </div>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                חזרה לדשבורד
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-8 grid gap-4">
          {REMINDERS.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-lg font-bold text-amber-700">
                    {index + 1}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{item.title}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                  </div>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                  {item.cta}
                </Link>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
