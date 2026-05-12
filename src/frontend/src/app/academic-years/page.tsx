"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/auth-backend-bridge";

interface AcademicYear {
  id: string;
  year_name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_archived: boolean;
  school_year_label: string | null;
}

interface FormState {
  year_name: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: FormState = {
  year_name: "",
  start_date: "",
  end_date: "",
};

export default function AcademicYearsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activatingYearId, setActivatingYearId] = useState<string | null>(null);
  const [archivingYearId, setArchivingYearId] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "admin";

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (!session) {
      router.push("/login");
      return;
    }

    void loadAcademicYears();
  }, [router, session, status]);

  const loadAcademicYears = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/academic-years");
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "הפעולה נכשלה");
      }
      setAcademicYears(data.data.academic_years || []);
    } catch (error) {
      console.error("Error loading academic years:", error);
      alert("שגיאה בטעינת שנות הלימוד");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateYear = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.year_name || !form.start_date || !form.end_date) {
      alert("מלאי שם שנה, תאריך התחלה ותאריך סיום.");
      return;
    }

    try {
      setSaving(true);
      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/academic-years", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "הפעולה נכשלה");
      }

      setForm(EMPTY_FORM);
      await loadAcademicYears();
    } catch (error: any) {
      console.error("Error creating academic year:", error);
      alert(error.message || "שגיאה ביצירת שנת הלימוד");
    } finally {
      setSaving(false);
    }
  };

  const handleActivateYear = async (year: AcademicYear) => {
    const shouldActivate = window.confirm(
      `האם להפעיל את ${year.year_name}?\nבמעבר יישוכפלו רק שכבות, כיתות אם והקבצות. שיבוצים לא ישוכפלו.`
    );

    if (!shouldActivate) {
      return;
    }

    try {
      setActivatingYearId(year.id);
      const response = await authenticatedFetch(`https://rooms-ma9h.onrender.com/api/academic-years/${year.id}/activate`, {
        method: "POST",
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "הפעולה נכשלה");
      }

      await loadAcademicYears();
    } catch (error: any) {
      console.error("Error activating academic year:", error);
      alert(error.message || "שגיאה בהפעלת שנת הלימוד");
    } finally {
      setActivatingYearId(null);
    }
  };

  const handleArchiveToggle = async (year: AcademicYear) => {
    try {
      setArchivingYearId(year.id);
      const response = await authenticatedFetch(`https://rooms-ma9h.onrender.com/api/academic-years/${year.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          is_archived: !year.is_archived,
        }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || "הפעולה נכשלה");
      }

      await loadAcademicYears();
    } catch (error: any) {
      console.error("Error updating academic year:", error);
      alert(error.message || "שגיאה בעדכון שנת הלימוד");
    } finally {
      setArchivingYearId(null);
    }
  };

  if (status === "loading" || loading) {
    return <div className="min-h-screen bg-gray-50 p-8 text-center">טוען...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <main className="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">שנות לימוד</h1>
          <p className="mt-2 text-sm text-gray-600">
            הפעלת שנה חדשה משכפלת רק שכבות, כיתות אם והקבצות. שיבוצים קיימים לא משתכפלים.
          </p>
        </div>

        {isAdmin && (
          <section className="mb-8 rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">שנה חדשה</h2>
            <form className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4" onSubmit={handleCreateYear}>
              <input
                value={form.year_name}
                onChange={(event) => setForm((current) => ({ ...current, year_name: event.target.value }))}
                placeholder="שם השנה, למשל תשפ״ז"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.start_date}
                onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={form.end_date}
                onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
              >
                {saving ? "שומר..." : "יצירת שנה"}
              </button>
            </form>
          </section>
        )}

        <section className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">שנים במערכת</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">שם שנה</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">טווח תאריכים</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">סטטוס</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-500">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {academicYears.map((year) => (
                  <tr key={year.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{year.year_name}</div>
                      <div className="text-xs text-gray-500">{year.school_year_label || "ללא תווית"}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">
                      {year.start_date} - {year.end_date}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {year.is_active && (
                          <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                            פעילה
                          </span>
                        )}
                        {year.is_archived && (
                          <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700">
                            בארכיון
                          </span>
                        )}
                        {!year.is_active && !year.is_archived && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
                            זמינה
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {isAdmin && !year.is_active && !year.is_archived && (
                          <button
                            onClick={() => handleActivateYear(year)}
                            disabled={activatingYearId === year.id}
                            className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
                          >
                            {activatingYearId === year.id ? "מפעיל..." : "הפעלת שנה"}
                          </button>
                        )}
                        {isAdmin && !year.is_active && (
                          <button
                            onClick={() => handleArchiveToggle(year)}
                            disabled={archivingYearId === year.id}
                            className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {year.is_archived ? "החזרה מארכיון" : "העברה לארכיון"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
