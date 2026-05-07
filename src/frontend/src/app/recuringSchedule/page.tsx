"use client";

import { useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import {
  hasAfterHoursSchedule,
  MAINTENANCE_AFTER_HOURS_MESSAGE,
} from "@/lib/afterHoursMaintenance";
import HebrewDateField from "@/components/HebrewDateField";
import { RECURRING_ROOM_REQUEST_ACTIVITY_OPTIONS } from "@/lib/schedulingActivityOptions";

interface ScheduleEntry {
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface RelocatedAssignment {
  assignmentId: number | string;
  activityType: string;
  previousRoomNumber: string;
  newRoomNumber: string;
  location: string;
}

interface ScheduledOccurrence {
  date: string;
  start_time: string;
  end_time: string;
  room_id: string | number;
  room_number: string;
  room_location: string;
  request_id: string | number;
  assignment_id: string | number;
  explanation?: string[];
  alerts?: string[];
  relocated_assignments?: RelocatedAssignment[];
}

interface RecurringSchedulingResponse {
  message: string;
  total_occurrences: number;
  assignments: ScheduledOccurrence[];
  requested_window?: {
    start_date: string;
    end_date: string;
  };
  preferred_room?: {
    room_id: string | number;
    room_number: string;
    location: string;
    matched_occurrences: number;
  } | null;
}

interface ActiveAcademicYearResponse {
  success: boolean;
  data?: {
    academic_year?: {
      end_date?: string | null;
    } | null;
  };
}

const HIGH_SCHOOL_PE_ACTIVITY_TYPE = "high_school_pe";

const DAY_OPTIONS = [
  { label: "ראשון", value: 0 },
  { label: "שני", value: 1 },
  { label: "שלישי", value: 2 },
  { label: "רביעי", value: 3 },
  { label: "חמישי", value: 4 },
  { label: "שישי", value: 5 },
];

const ACTIVITY_OPTIONS = RECURRING_ROOM_REQUEST_ACTIVITY_OPTIONS;

type DayHours = Record<number, { start: string; end: string }>;

const getToday = () => new Date().toISOString().split("T")[0];

export default function RecurringSchedulePage({
  onClose,
  embedded = false,
}: {
  onClose: () => void;
  embedded?: boolean;
}) {
  const [groupName, setGroupName] = useState("");
  const [activityType, setActivityType] = useState("study_group");
  const [grade, setGrade] = useState("");
  const [studentCount, setStudentCount] = useState("");
  const [needsProjector, setNeedsProjector] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hours, setHours] = useState<DayHours>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecurringSchedulingResponse | null>(null);
  const [showRelocationModal, setShowRelocationModal] = useState(false);
  const [activeAcademicYearEndDate, setActiveAcademicYearEndDate] = useState("");

  const isHighSchoolPe = activityType === HIGH_SCHOOL_PE_ACTIVITY_TYPE;

  const selectedOccurrencesPreview = useMemo(
    () =>
      selectedDays
        .map((day) => {
          const option = DAY_OPTIONS.find((item) => item.value === day);
          const dayHours = hours[day];
          return option ? `${option.label}: ${dayHours?.start || "08:00"}-${dayHours?.end || "10:00"}` : null;
        })
        .filter(Boolean),
    [hours, selectedDays]
  );

  const relocatedOccurrences = useMemo(
    () => result?.assignments.filter((assignment) => (assignment.relocated_assignments?.length || 0) > 0) ?? [],
    [result]
  );

  useEffect(() => {
    setShowRelocationModal(relocatedOccurrences.length > 0);
  }, [relocatedOccurrences]);

  useEffect(() => {
    const loadActiveAcademicYear = async () => {
      try {
        const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/academic-years/active");
        const data: ActiveAcademicYearResponse = await response.json();

        if (!data.success) {
          return;
        }

        setActiveAcademicYearEndDate(data.data?.academic_year?.end_date || "");
      } catch (loadError) {
        console.error("Error loading active academic year:", loadError);
      }
    };

    loadActiveAcademicYear();
  }, []);

  useEffect(() => {
    if (isHighSchoolPe && activeAcademicYearEndDate) {
      setEndDate(activeAcademicYearEndDate);
    }
  }, [activeAcademicYearEndDate, isHighSchoolPe]);

  const toggleDay = (day: number) => {
    setSelectedDays((current) =>
      current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b)
    );
  };

  const updateHours = (day: number, field: "start" | "end", value: string) => {
    setHours((current) => ({
      ...current,
      [day]: {
        start: current[day]?.start || "08:00",
        end: current[day]?.end || "10:00",
        [field]: value,
      },
    }));
  };

  const buildSchedule = (): ScheduleEntry[] =>
    selectedDays.map((day) => ({
      day_of_week: day,
      start_time: hours[day]?.start || "08:00",
      end_time: hours[day]?.end || "10:00",
    }));

  const handleActivityChange = (value: string) => {
    setActivityType(value);
    if (value === HIGH_SCHOOL_PE_ACTIVITY_TYPE) {
      setStartDate(getToday());
      setEndDate(activeAcademicYearEndDate);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await authenticatedFetch("https://rooms-ma9h.onrender.com/api/room-requests/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          group_name: groupName.trim() || null,
          activity_type: activityType,
          grade,
          student_count: Number(studentCount),
          start_date: startDate,
          end_date: endDate,
          needs_projector: needsProjector,
          weekly_schedule: buildSchedule(),
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || "יצירת השיבוץ התדיר נכשלה");
        return;
      }

      setResult(data.data);
      if (hasAfterHoursSchedule(buildSchedule())) {
        alert(MAINTENANCE_AFTER_HOURS_MESSAGE);
      }
    } catch (submitError) {
      console.error("Error creating recurring room request:", submitError);
      setError("אירעה שגיאה בשליחת בקשת השיבוץ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={embedded ? "" : "min-h-screen bg-slate-100 p-6"} dir="rtl">
      {showRelocationModal && relocatedOccurrences.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
          <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.45)] ring-1 ring-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-slate-900">בוצעו העברות בשיבוץ התדיר</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  כדי לפנות מקום לחלק מהמופעים, המערכת העבירה שיבוצים קיימים לחדרים חלופיים.
                  חשוב לאשר שקראת את העדכון.
                </p>
              </div>
              <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                נדרש אישור
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {relocatedOccurrences.map((occurrence) => (
                <div
                  key={`${occurrence.assignment_id}-${occurrence.date}-${occurrence.start_time}`}
                  className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-4"
                >
                  <div className="text-sm font-semibold text-sky-950">
                    {occurrence.date} | {occurrence.start_time}-{occurrence.end_time} | חדר {occurrence.room_number}
                  </div>
                  <div className="mt-3 space-y-2">
                    {occurrence.relocated_assignments?.map((item, index) => (
                      <div
                        key={`${item.assignmentId}-${index}`}
                        className="rounded-xl bg-white/80 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-100"
                      >
                        {item.activityType}: {item.previousRoomNumber} הועבר אל {item.newRoomNumber} (
                        {item.location})
                      </div>
                    ))}
                  </div>
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

      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">שיבוץ תדיר לקבוצה חדשה</h2>
              <p className="mt-2 text-sm text-slate-600">
                המערכת תחפש קודם את החדר שמתאים למספר הגדול ביותר של המופעים, ואז תשלים את
                שאר המועדים בחדרים חלופיים לפי אותם כללי שיבוץ של בקשה חד פעמית.
              </p>
            </div>
            <div className="flex items-center gap-3">
              {embedded && (
                <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
                  מצב פעיל: שיבוץ מתקדם
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {embedded ? "חזרה לחד פעמי" : "סגור"}
              </button>
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">שם הקבוצה</label>
              <input
                type="text"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="למשל: התעמלות תיכון"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">סוג פעילות</label>
              <select
                value={activityType}
                onChange={(event) => handleActivityChange(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              >
                {ACTIVITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">שכבה</label>
              <select
                value={grade}
                onChange={(event) => setGrade(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
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
                min="1"
                value={studentCount}
                onChange={(event) => setStudentCount(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="מספר תלמידים"
              />
            </div>

            <HebrewDateField
              label="מתאריך"
              value={startDate}
              onChange={setStartDate}
              min={getToday()}
              inputClassName="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />

            <HebrewDateField
              label="עד תאריך"
              value={endDate}
              onChange={setEndDate}
              min={startDate || getToday()}
              inputClassName="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            />
          </div>

          {isHighSchoolPe && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              התעמלות תיכון תשובץ מהיום ועד סוף שנת הלימודים, ורק באולם אם פנוי או בספרייה אם
              פנויה.
            </div>
          )}

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={needsProjector}
                onChange={(event) => setNeedsProjector(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              נדרש מקרן
            </label>
          </div>

          <div className="mt-8">
            <h3 className="text-base font-semibold text-slate-900">ימי שיבוץ ושעות</h3>
            <div className="mt-4 space-y-3">
              {DAY_OPTIONS.map((day) => (
                <div key={day.value} className="rounded-2xl border border-slate-200 p-4">
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day.value)}
                      onChange={() => toggleDay(day.value)}
                    />
                    {day.label}
                  </label>

                  {selectedDays.includes(day.value) && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input
                        type="time"
                        value={hours[day.value]?.start || "08:00"}
                        onChange={(event) => updateHours(day.value, "start", event.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-2.5"
                      />
                      <input
                        type="time"
                        value={hours[day.value]?.end || "10:00"}
                        onChange={(event) => updateHours(day.value, "end", event.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-2.5"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {selectedOccurrencesPreview.length > 0 && (
            <div className="mt-6 rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
              <div className="text-sm font-semibold text-sky-900">מופעים שבועיים שנבחרו</div>
              <div className="mt-2 space-y-1 text-sm text-sky-800">
                {selectedOccurrencesPreview.map((item) => (
                  <div key={item}>{item}</div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          )}

          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700"
            >
              {embedded ? "חזרה" : "ביטול"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loading ? "משבץ..." : "בצעי שיבוץ תדיר"}
            </button>
          </div>
        </div>

        {result && (
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-xl font-bold text-slate-900">תוצאת השיבוץ</h3>
            <p className="mt-2 text-sm text-slate-700">{result.message}</p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {result.requested_window && (
                <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <div className="text-sm font-semibold text-slate-900">טווח שביקשת</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {result.requested_window.start_date} עד {result.requested_window.end_date}
                  </div>
                </div>
              )}
              {result.preferred_room && (
                <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
                  <div className="text-sm font-semibold text-emerald-900">חדר מוביל בסדרה</div>
                  <div className="mt-1 text-sm text-emerald-800">
                    {result.preferred_room.room_number} | {result.preferred_room.location}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-4">
              {result.assignments.map((assignment) => (
                <div
                  key={`${assignment.assignment_id}-${assignment.date}-${assignment.start_time}`}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        {assignment.date} | {assignment.start_time}-{assignment.end_time}
                      </div>
                      <div className="mt-1 text-sm text-slate-700">
                        חדר <strong>{assignment.room_number}</strong> | {assignment.room_location}
                      </div>
                    </div>
                    {(assignment.relocated_assignments?.length || 0) > 0 && (
                      <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800">
                        בוצעה העברה
                      </div>
                    )}
                  </div>

                  {assignment.explanation && assignment.explanation.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-slate-900">למה נבחר החדר הזה</div>
                      <ul className="mt-2 space-y-2 text-sm text-slate-700">
                        {assignment.explanation.map((reason, index) => (
                          <li
                            key={`${assignment.assignment_id}-reason-${index}`}
                            className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200"
                          >
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {assignment.alerts && assignment.alerts.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-amber-900">התראות</div>
                      <ul className="mt-2 space-y-2 text-sm text-amber-800">
                        {assignment.alerts.map((alertText, index) => (
                          <li
                            key={`${assignment.assignment_id}-alert-${index}`}
                            className="rounded-xl bg-amber-50 px-3 py-2 ring-1 ring-amber-100"
                          >
                            {alertText}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {assignment.relocated_assignments && assignment.relocated_assignments.length > 0 && (
                    <div className="mt-4">
                      <div className="text-sm font-semibold text-sky-900">שיבוצים שהועברו</div>
                      <ul className="mt-2 space-y-2 text-sm text-sky-800">
                        {assignment.relocated_assignments.map((item, index) => (
                          <li
                            key={`${assignment.assignment_id}-relocation-${index}`}
                            className="rounded-xl bg-sky-50 px-3 py-2 ring-1 ring-sky-100"
                          >
                            {item.activityType}: {item.previousRoomNumber} הועבר אל {item.newRoomNumber} (
                            {item.location})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
