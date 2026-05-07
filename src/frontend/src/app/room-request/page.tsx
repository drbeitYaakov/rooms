"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import {
  isAfterHoursAssignment,
  MAINTENANCE_AFTER_HOURS_MESSAGE,
} from "@/lib/afterHoursMaintenance";
import HebrewDateField from "@/components/HebrewDateField";
import { BASE_ROOM_REQUEST_ACTIVITY_OPTIONS } from "@/lib/schedulingActivityOptions";
import { RecurringSchedulePageContent } from "../recuringSchedule/page";

interface Room {
  id: number | string;
  room_number: string;
  capacity: number;
  room_type: string;
  status: string;
  has_projector?: boolean;
}

interface AlternativeRoom {
  roomNumber: string;
  location: string;
  reasons: string[];
}

interface RelocatedAssignment {
  assignmentId: number | string;
  activityType: string;
  previousRoomNumber: string;
  newRoomNumber: string;
  location: string;
}

interface SchedulingResult {
  message: string;
  room: Room;
  location?: string;
  explanation?: string[];
  alerts?: string[];
  alternatives?: AlternativeRoom[];
  relocated_assignments?: RelocatedAssignment[];
}

type RequestMode = "single" | "advanced";

const initialFormState = {
  activityType: "",
  grade: "",
  studentCount: "",
  date: "",
  startTime: "",
  endTime: "",
  needsProjector: false,
};

const modeCards: Array<{
  value: RequestMode;
  title: string;
  description: string;
}> = [
  {
    value: "single",
    title: "שיבוץ חד פעמי",
    description: "לבקשה בודדת ביום ושעה מסוימים עם תשובה מיידית.",
  },
  {
    value: "advanced",
    title: "שיבוץ מתקדם",
    description: "לקבוצה חדשה עם כמה ימים קבועים, טווח תאריכים וחיפוש חדר מוביל.",
  },
];

export default function RoomRequestPage() {
  const { data: session } = useSession();
  const [mode, setMode] = useState<RequestMode>("single");
  const [formData, setFormData] = useState(initialFormState);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<SchedulingResult | null>(null);
  const [showRelocationModal, setShowRelocationModal] = useState(false);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/rooms");
        const data = await response.json();

        if (data.success) {
          setRooms(data.data.rooms.filter((room: Room) => room.status === "ACTIVE"));
        }
      } catch (error) {
        console.error("Error fetching rooms:", error);
      }
    };

    fetchRooms();
  }, []);

  useEffect(() => {
    if (result?.relocated_assignments && result.relocated_assignments.length > 0) {
      setShowRelocationModal(true);
      return;
    }

    setShowRelocationModal(false);
  }, [result]);

  const suggestedRoom = useMemo(() => {
    const studentCount = parseInt(formData.studentCount, 10);
    if (!studentCount || rooms.length === 0) {
      return null;
    }

    const suitableRooms = rooms.filter((room) => {
      if (room.capacity < studentCount) {
        return false;
      }

      if (formData.needsProjector && !room.has_projector) {
        return false;
      }

      return true;
    });

    if (suitableRooms.length === 0) {
      return null;
    }

    return suitableRooms.reduce((best, current) => {
      const bestDiff = best.capacity - studentCount;
      const currentDiff = current.capacity - studentCount;
      return currentDiff < bestDiff ? current : best;
    });
  }, [formData.needsProjector, formData.studentCount, rooms]);

  const handleInputChange = (field: keyof typeof initialFormState, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSubmitError(null);
    setResult(null);

    try {
      const requestData = {
        activity_type: formData.activityType,
        grade: formData.grade,
        student_count: parseInt(formData.studentCount, 10),
        date: formData.date,
        start_time: formData.startTime,
        end_time: formData.endTime,
        needs_projector: formData.needsProjector,
        requester_id: session?.user?.id,
      };

      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/room-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data.data);
        setFormData(initialFormState);
        if (isAfterHoursAssignment(formData.startTime, formData.endTime)) {
          alert(MAINTENANCE_AFTER_HOURS_MESSAGE);
        }
      } else {
        const message = data.error || "לא ניתן היה להשלים את השיבוץ.";
        setSubmitError(message);
        setResult({
          message,
          room: {
            id: "",
            room_number: "",
            capacity: 0,
            room_type: "",
            status: "",
          },
          alerts: data.alerts || [],
          alternatives: data.alternatives || [],
        });
      }
    } catch (error) {
      console.error("Error submitting room request:", error);
      setSubmitError("אירעה שגיאה בשליחת הבקשה. נסו שוב.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      {showRelocationModal && result?.relocated_assignments && result.relocated_assignments.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">בוצעה העברת קבוצה קיימת</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  כדי לפנות מקום לבקשת הדידקטיקה, המערכת העבירה שיבוץ קיים לחדר חלופי. חשוב לאשר
                  שקראת את העדכון.
                </p>
              </div>
              <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                נדרש אישור
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {result.relocated_assignments.map((item, index) => (
                <div
                  key={`${item.assignmentId}-${index}`}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
                >
                  <div className="font-semibold">{item.activityType}</div>
                  <div className="mt-1">
                    החדר <strong>{item.previousRoomNumber}</strong> פונה, והשיבוץ הועבר אל{" "}
                    <strong>{item.newRoomNumber}</strong>.
                  </div>
                  <div className="mt-1 text-sky-800">{item.location}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowRelocationModal(false)}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                קראתי ואישרתי
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">בקשת חדר</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                בחרי את סוג השיבוץ הרצוי. אפשר לעבור בין בקשה חד פעמית לבין שיבוץ מתקדם בלי
                לצאת מהמסך.
              </p>
            </div>
            <div className="inline-flex rounded-2xl bg-slate-100 p-1 ring-1 ring-slate-200">
              {modeCards.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    mode === item.value
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {modeCards.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setMode(item.value)}
                className={`rounded-2xl border p-4 text-right transition ${
                  mode === item.value
                    ? "border-sky-300 bg-sky-50 shadow-sm"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                }`}
              >
                <div className="text-base font-semibold text-slate-900">{item.title}</div>
                <div className="mt-1 text-sm text-slate-600">{item.description}</div>
              </button>
            ))}
          </div>
        </div>

        {mode === "single" ? (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <div className="mb-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <div className="text-sm font-semibold text-slate-900">מצב פעיל: שיבוץ חד פעמי</div>
                <div className="mt-1 text-sm text-slate-600">
                  מתאים לבקשת חדר אחת עם תאריך, שעה ותגובה מיידית.
                </div>
              </div>

              <p className="mt-2 text-sm text-slate-600">
                השיבוץ מתבצע לפי סוג הקבוצה, הצורך במקרן, סדרי העדיפויות, כללים מיוחדים,
                התראות למשתמש וחלופות אפשריות.
              </p>

              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">סוג פעילות</label>
                    <select
                      value={formData.activityType}
                      onChange={(e) => handleInputChange("activityType", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      required
                    >
                      <option value="">בחרו סוג פעילות</option>
                      {BASE_ROOM_REQUEST_ACTIVITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">שכבה</label>
                    <select
                      value={formData.grade}
                      onChange={(e) => handleInputChange("grade", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      required
                    >
                      <option value="">בחרו שכבה</option>
                      <option value="א">א'</option>
                      <option value="ב">ב'</option>
                      <option value="ג">ג'</option>
                      <option value="ד">ד'</option>
                      <option value="ה">ה'</option>
                      <option value="ו">ו'</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">מספר תלמידים</label>
                    <input
                      type="number"
                      value={formData.studentCount}
                      onChange={(e) => handleInputChange("studentCount", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      min="1"
                      placeholder="הזינו מספר תלמידים"
                      required
                    />
                  </div>

                  <HebrewDateField
                    label="תאריך"
                    value={formData.date}
                    onChange={(value: string) => handleInputChange("date", value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                    inputClassName="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">שעת התחלה</label>
                    <input
                      type="time"
                      value={formData.startTime}
                      onChange={(e) => handleInputChange("startTime", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700">שעת סיום</label>
                    <input
                      type="time"
                      value={formData.endTime}
                      onChange={(e) => handleInputChange("endTime", e.target.value)}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-l from-sky-50 to-cyan-50 p-5 ring-1 ring-sky-100">
                  <label className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-base font-semibold text-slate-900">האם צריך מקרן?</div>
                      <p className="mt-1 text-sm text-slate-600">
                        כאשר מסמנים, הבדיקה תעדיף רק חדרים עם מקרן ותסביר זאת גם בתוצאת
                        השיבוץ.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.needsProjector}
                      onChange={(e) => handleInputChange("needsProjector", e.target.checked)}
                      className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                  </label>
                </div>

                {submitError && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                    {submitError}
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {loading ? "משבץ חדר..." : "בצעי שיבוץ"}
                  </button>
                </div>
              </form>
            </section>

            <aside className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">הצעת התאמה ראשונית</h2>
                {suggestedRoom ? (
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    לפי מספר התלמידים{formData.needsProjector ? " והצורך במקרן" : ""}, חדר מתאים
                    יכול להיות <strong>{suggestedRoom.room_number}</strong> עם קיבולת של{" "}
                    <strong>{suggestedRoom.capacity}</strong>.
                  </p>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    לאחר מילוי פרטי הקבוצה נציג כאן התאמה ראשונית, ולחיצה על השיבוץ תריץ את
                    הלוגיקה המלאה עם כל הכללים וההתראות.
                  </p>
                )}
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                <h2 className="text-lg font-semibold text-slate-900">כללי השיבוץ שמופעלים</h2>
                <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <p>
                    המערכת בודקת קודם כל כללים מיוחדים לפי סוג קבוצה, ורק אחר כך את סדרי
                    העדיפויות הכלליים.
                  </p>
                  <p>
                    התוצאה כוללת חדר נבחר, קומה ואגף, נימוק לבחירה, התראות למשתמש וחלופות
                    אפשריות.
                  </p>
                </div>
              </section>

              {result && (
                <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-900">תוצאת השיבוץ</h2>
                  <p className="mt-3 text-sm text-slate-800">{result.message}</p>

                  {result.room.room_number && (
                    <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                      <div className="text-sm font-semibold text-emerald-900">
                        חדר משובץ: {result.room.room_number}
                      </div>
                      {result.location && (
                        <div className="mt-1 text-sm text-emerald-800">מיקום: {result.location}</div>
                      )}
                    </div>
                  )}

                  {result.explanation && result.explanation.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-slate-900">למה נבחר החדר הזה</h3>
                      <ul className="mt-2 space-y-2 text-sm text-slate-700">
                        {result.explanation.map((reason, index) => (
                          <li key={`${reason}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.alerts && result.alerts.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-amber-900">התראות למשתמש</h3>
                      <ul className="mt-2 space-y-2 text-sm text-amber-800">
                        {result.alerts.map((alertText, index) => (
                          <li key={`${alertText}-${index}`} className="rounded-xl bg-amber-50 px-3 py-2">
                            {alertText}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.relocated_assignments && result.relocated_assignments.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-sky-900">שיבוצים שעודכנו אוטומטית</h3>
                      <ul className="mt-2 space-y-2 text-sm text-sky-800">
                        {result.relocated_assignments.map((item, index) => (
                          <li key={`${item.assignmentId}-${index}`} className="rounded-xl bg-sky-50 px-3 py-2">
                            {item.activityType}: {item.previousRoomNumber} הועבר אל {item.newRoomNumber} (
                            {item.location})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {result.alternatives && result.alternatives.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-slate-900">חלופות אפשריות</h3>
                      <ul className="mt-2 space-y-2 text-sm text-slate-700">
                        {result.alternatives.map((alternative, index) => (
                          <li key={`${alternative.roomNumber}-${index}`} className="rounded-xl bg-slate-50 px-3 py-2">
                            <strong>{alternative.roomNumber}</strong>
                            {` - ${alternative.location}`}
                            {alternative.reasons.length > 0 ? ` | ${alternative.reasons.join(", ")}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
            </aside>
          </div>
        ) : (
          <RecurringSchedulePageContent embedded onClose={() => setMode("single")} />
        )}
      </div>
    </div>
  );
}
