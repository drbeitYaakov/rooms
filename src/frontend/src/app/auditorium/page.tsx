"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface ScheduleEntry {
  id?: string;
  start_time: string;
  end_time: string;
  title: string;
  note?: string | null;
}

interface WeeklySlot {
  day_of_week: number;
  is_active: boolean;
  entries: ScheduleEntry[];
}

interface AuditoriumRoom {
  id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
}

interface RoomOverride {
  id: string;
  room_id: string | null;
  room_name?: string | null;
  effective_from: string;
  weekly_schedule: WeeklySlot[];
}

interface AuditoriumDefaultsData {
  system_default: {
    start_time: string;
    end_time: string;
    weekly_schedule: WeeklySlot[];
  };
  auditoriums: AuditoriumRoom[];
  room_overrides: RoomOverride[];
}

interface FormState {
  room_id: string;
  effective_from: string;
  weekly_schedule: WeeklySlot[];
}

interface EntryChange {
  token: string;
  day_of_week: number;
  entry_id: string;
  type: "added" | "edited" | "removed";
  currentEntry?: ScheduleEntry;
  previousEntry?: ScheduleEntry;
}

const TITLE_OPTIONS = ["שנה ג'", "התעמלות א", "מסלול התעמלות", "אחר"] as const;

const dayLabels: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
};

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const createEntry = (title = "שנה ג'"): ScheduleEntry => ({
  id: crypto.randomUUID(),
  start_time: "17:00",
  end_time: "22:00",
  title,
  note: "",
});

const buildDefaultWeeklySchedule = (): WeeklySlot[] =>
  [0, 1, 2, 3, 4, 5].map((day) => ({
    day_of_week: day,
    is_active: day === 0,
    entries: day === 0 ? [createEntry()] : [],
  }));

const normalizeWeeklyScheduleForForm = (weeklySchedule?: WeeklySlot[]) => {
  const byDay = new Map((weeklySchedule || []).map((slot) => [slot.day_of_week, slot]));

  return buildDefaultWeeklySchedule().map((base) => {
    const incoming = byDay.get(base.day_of_week);
    if (!incoming) {
      return base;
    }

    return {
      day_of_week: incoming.day_of_week,
      is_active: incoming.is_active,
      entries: (incoming.entries || []).map((entry) => ({
        id: entry.id || crypto.randomUUID(),
        start_time: entry.start_time,
        end_time: entry.end_time,
        title: entry.title,
        note: entry.note || "",
      })),
    };
  });
};

const serializeSlot = (slot: WeeklySlot) =>
  JSON.stringify({
    day_of_week: slot.day_of_week,
    is_active: slot.is_active,
    entries: slot.entries.map((entry) => ({
      start_time: entry.start_time,
      end_time: entry.end_time,
      title: entry.title,
      note: entry.note || "",
    })),
  });

const serializeEntry = (entry: ScheduleEntry) =>
  JSON.stringify({
    start_time: entry.start_time,
    end_time: entry.end_time,
    title: entry.title,
    note: entry.note || "",
  });

const getResolvedRoomOverride = (
  defaultsData: AuditoriumDefaultsData | null,
  roomId: string,
  effectiveFrom: string
) => {
  if (!defaultsData) {
    return null;
  }

  return (
    defaultsData.room_overrides.find(
      (setting) => setting.room_id === roomId && setting.effective_from <= effectiveFrom
    ) || null
  );
};

const getBaselineWeeklySchedule = (
  defaultsData: AuditoriumDefaultsData | null,
  roomId: string,
  effectiveFrom: string
): WeeklySlot[] => {
  if (!defaultsData) {
    return buildDefaultWeeklySchedule();
  }

  const roomSetting = getResolvedRoomOverride(defaultsData, roomId, effectiveFrom);
  return normalizeWeeklyScheduleForForm(
    roomSetting?.weekly_schedule || defaultsData.system_default.weekly_schedule
  );
};

export default function AuditoriumPage() {
  const { data: session } = useSession();
  const canManage = session?.user?.role === "admin" || session?.user?.role === "grade_coordinator";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [defaultsData, setDefaultsData] = useState<AuditoriumDefaultsData | null>(null);
  const [selectedGlobalChanges, setSelectedGlobalChanges] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>({
    room_id: "",
    effective_from: getToday(),
    weekly_schedule: buildDefaultWeeklySchedule(),
  });

  useEffect(() => {
    void loadDefaults().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!defaultsData || !form.room_id) {
      return;
    }

    const effectiveFrom = getToday();
    const baselineSchedule = getBaselineWeeklySchedule(defaultsData, form.room_id, effectiveFrom);

    setForm((current) => ({
      ...current,
      effective_from: effectiveFrom,
      weekly_schedule: baselineSchedule,
    }));
    setSelectedGlobalChanges([]);
  }, [defaultsData, form.room_id]);

  const loadDefaults = async () => {
    const response = await authenticatedFetch("http://localhost:3001/api/auditoriums/default-settings");
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "failed");
    }

    setDefaultsData(data.data);
    setForm((current) => ({
      ...current,
      weekly_schedule: normalizeWeeklyScheduleForForm(data.data.system_default.weekly_schedule),
    }));
    setSelectedGlobalChanges([]);
  };

  const baselineWeeklySchedule = useMemo(
    () => getBaselineWeeklySchedule(defaultsData, form.room_id, form.effective_from),
    [defaultsData, form.effective_from, form.room_id]
  );

  const entryChangesByDay = useMemo(() => {
    const changes = new Map<number, EntryChange[]>();

    form.weekly_schedule.forEach((slot, index) => {
      const baselineSlot = baselineWeeklySchedule[index] || buildDefaultWeeklySchedule()[index];
      const baselineEntries = new Map((baselineSlot?.entries || []).map((entry) => [entry.id || "", entry]));
      const currentEntries = new Map((slot.entries || []).map((entry) => [entry.id || "", entry]));
      const dayChanges: EntryChange[] = [];

      for (const entry of slot.entries) {
        const entryId = entry.id || "";
        const baselineEntry = baselineEntries.get(entryId);
        if (!baselineEntry) {
          dayChanges.push({
            token: `${slot.day_of_week}:${entryId}`,
            day_of_week: slot.day_of_week,
            entry_id: entryId,
            type: "added",
            currentEntry: entry,
          });
          continue;
        }

        if (serializeEntry(entry) !== serializeEntry(baselineEntry)) {
          dayChanges.push({
            token: `${slot.day_of_week}:${entryId}`,
            day_of_week: slot.day_of_week,
            entry_id: entryId,
            type: "edited",
            currentEntry: entry,
            previousEntry: baselineEntry,
          });
        }
      }

      for (const entry of baselineSlot?.entries || []) {
        const entryId = entry.id || "";
        if (!currentEntries.has(entryId)) {
          dayChanges.push({
            token: `${slot.day_of_week}:${entryId}`,
            day_of_week: slot.day_of_week,
            entry_id: entryId,
            type: "removed",
            previousEntry: entry,
          });
        }
      }

      changes.set(slot.day_of_week, dayChanges);
    });

    return changes;
  }, [baselineWeeklySchedule, form.weekly_schedule]);

  const dirtyDays = useMemo(
    () =>
      form.weekly_schedule
        .filter((slot) => (entryChangesByDay.get(slot.day_of_week) || []).length > 0)
        .map((slot) => slot.day_of_week),
    [entryChangesByDay, form.weekly_schedule]
  );

  const updateEntry = (dayOfWeek: number, entryId: string | undefined, patch: Partial<ScheduleEntry>) => {
    setForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek
          ? {
              ...slot,
              entries: slot.entries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry)),
            }
          : slot
      ),
    }));
  };

  const addEntry = (dayOfWeek: number) => {
    setForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek
          ? {
              ...slot,
              is_active: true,
              entries: [...slot.entries, createEntry("אחר")],
            }
          : slot
      ),
    }));
  };

  const removeEntry = (dayOfWeek: number, entryId: string | undefined) => {
    setForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) => {
        if (slot.day_of_week !== dayOfWeek) {
          return slot;
        }

        const entries = slot.entries.filter((entry) => entry.id !== entryId);
        return {
          ...slot,
          is_active: entries.length > 0,
          entries,
        };
      }),
    }));
  };

  const toggleDayActive = (dayOfWeek: number, isActive: boolean) => {
    setForm((current) => ({
      ...current,
      weekly_schedule: current.weekly_schedule.map((slot) =>
        slot.day_of_week === dayOfWeek
          ? {
              ...slot,
              is_active: isActive,
              entries: isActive ? (slot.entries.length > 0 ? slot.entries : [createEntry()]) : [],
            }
          : slot
      ),
    }));
  };

  const toggleGlobalChangeSelection = (token: string, checked: boolean) => {
    setSelectedGlobalChanges((current) =>
      checked
        ? Array.from(new Set([...current, token])).sort()
        : current.filter((value) => value !== token)
    );
  };

  const saveRoomOverride = async () => {
    if (!form.room_id) {
      alert("בחרו אולם לעריכה");
      return;
    }

    if (dirtyDays.length === 0) {
      alert("אין כרגע שינויים לשמירה.");
      return;
    }

    if (selectedGlobalChanges.length === 0) {
      alert("בחרי לפחות שינוי אחד לשמירה גלובלית.");
      return;
    }

    try {
      setSaving(true);
      const response = await authenticatedFetch("http://localhost:3001/api/auditoriums/default-settings/room", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          selected_changes: selectedGlobalChanges.map((token) => {
            const [dayOfWeek, entryId] = token.split(":");
            return {
              day_of_week: Number(dayOfWeek),
              entry_id: entryId,
            };
          }),
        }),
      });
      const data = await response.json();

      if (!data.success) {
        alert(`שגיאה: ${data.error}`);
        return;
      }

      await loadDefaults();
      alert("השינויים שסומנו נשמרו גלובלית.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-lg text-gray-600">טוען...</div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ניהול אולם</h1>
              <p className="text-gray-600">ערכי שינויים, סמני אילו ימים יישמרו גלובלית, ורק הם יתעדכנו בהגדרות.</p>
            </div>

            <div className="mb-6 rounded-lg border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              אפשר להגדיר לכל יום כמה רצפים נפרדים. כל יום עם שינוי יסומן, ורק ימים שתסמני יישמרו כהגדרה גלובלית.
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="text-lg font-medium text-gray-900">עריכת שיבוצי אולם</h2>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <select
                    value={form.room_id}
                    onChange={(e) => setForm((current) => ({ ...current, room_id: e.target.value }))}
                    className="md:col-span-2 rounded-md border border-gray-300 px-3 py-2"
                  >
                    <option value="">בחר אולם</option>
                    {(defaultsData?.auditoriums || []).map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.room_number} - קומה {room.floor}
                      </option>
                    ))}
                  </select>

                  <input
                    type="date"
                    value={form.effective_from}
                    onChange={(e) => setForm((current) => ({ ...current, effective_from: e.target.value }))}
                    className="rounded-md border border-gray-300 px-3 py-2"
                  />
                </div>

                <div className="mt-6 space-y-4">
                  {form.weekly_schedule.map((slot) => {
                    const isDirty = dirtyDays.includes(slot.day_of_week);
                    const dayChanges = entryChangesByDay.get(slot.day_of_week) || [];

                    return (
                      <div
                        key={slot.day_of_week}
                        className={`rounded-xl border p-4 ${isDirty ? "border-amber-300 bg-amber-50/40" : "border-gray-200"}`}
                      >
                        <div className="mb-3 flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={slot.is_active}
                                onChange={(e) => toggleDayActive(slot.day_of_week, e.target.checked)}
                              />
                              {dayLabels[slot.day_of_week]}
                            </label>

                            {isDirty && (
                              <div className="text-xs font-medium text-amber-800">
                                סמני רק את הרצפים שאת רוצה לשמור גלובלית
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {isDirty && (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                                יש שינוי
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => addEntry(slot.day_of_week)}
                              disabled={!slot.is_active}
                              className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40"
                            >
                              הוסף רצף
                            </button>
                          </div>
                        </div>

                        {!slot.is_active || slot.entries.length === 0 ? (
                          <div className="text-sm text-gray-400">אין שיבוצים ביום הזה</div>
                        ) : (
                          <div className="space-y-3">
                            {slot.entries.map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                                {dayChanges
                                  .filter((change) => change.entry_id === entry.id && change.currentEntry)
                                  .map((change) => (
                                    <label key={change.token} className="mb-3 flex items-center gap-2 text-xs font-medium text-amber-800">
                                      <input
                                        type="checkbox"
                                        checked={selectedGlobalChanges.includes(change.token)}
                                        onChange={(e) => toggleGlobalChangeSelection(change.token, e.target.checked)}
                                      />
                                      {change.type === "added" ? "שמרי הוספה זו גלובלית" : "שמרי שינוי זה גלובלית"}
                                    </label>
                                  ))}

                                <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                  <input
                                    type="time"
                                    value={entry.start_time}
                                    onChange={(e) => updateEntry(slot.day_of_week, entry.id, { start_time: e.target.value })}
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                  />
                                  <input
                                    type="time"
                                    value={entry.end_time}
                                    onChange={(e) => updateEntry(slot.day_of_week, entry.id, { end_time: e.target.value })}
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                  />

                                  <select
                                    value={TITLE_OPTIONS.includes(entry.title as (typeof TITLE_OPTIONS)[number]) ? entry.title : "אחר"}
                                    onChange={(e) =>
                                      updateEntry(slot.day_of_week, entry.id, {
                                        title: e.target.value === "אחר" ? "" : e.target.value,
                                      })
                                    }
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                  >
                                    {TITLE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>

                                  <input
                                    type="text"
                                    value={TITLE_OPTIONS.includes(entry.title as (typeof TITLE_OPTIONS)[number]) ? "" : entry.title}
                                    onChange={(e) => updateEntry(slot.day_of_week, entry.id, { title: e.target.value })}
                                    placeholder="שם חופשי אם נבחר 'אחר'"
                                    className="rounded-md border border-gray-300 px-3 py-2"
                                  />
                                </div>

                                <textarea
                                  value={entry.note || ""}
                                  onChange={(e) => updateEntry(slot.day_of_week, entry.id, { note: e.target.value })}
                                  placeholder="הערה לשיבוץ"
                                  rows={2}
                                  className="w-full rounded-md border border-gray-300 px-3 py-2"
                                />

                                <div className="mt-3 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => removeEntry(slot.day_of_week, entry.id)}
                                    className="text-sm font-medium text-rose-600"
                                  >
                                    מחק רצף
                                  </button>
                                </div>
                              </div>
                            ))}

                            {dayChanges
                              .filter((change) => change.type === "removed")
                              .map((change) => (
                                <div key={change.token} className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                                  <label className="flex items-center gap-2 text-xs font-medium text-rose-700">
                                    <input
                                      type="checkbox"
                                      checked={selectedGlobalChanges.includes(change.token)}
                                      onChange={(e) => toggleGlobalChangeSelection(change.token, e.target.checked)}
                                    />
                                    שמרי גלובלית מחיקה של הרצף{" "}
                                    {change.previousEntry?.start_time} - {change.previousEntry?.end_time}
                                  </label>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {canManage && (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {dirtyDays.length === 0
                        ? "אין כרגע שינויים פתוחים."
                        : `יש ${dirtyDays.length} ימים עם שינויים. סמני רק את השינויים הספציפיים שברצונך לשמור גלובלית.`}
                    </div>

                    <button
                      onClick={() => void saveRoomOverride()}
                      disabled={saving || dirtyDays.length === 0 || selectedGlobalChanges.length === 0}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:bg-indigo-300"
                    >
                      {saving ? "שומר..." : "שמור שינויים גלובליים"}
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-lg font-medium text-gray-900">הגדרות אולם קיימות</h2>
                <div className="space-y-3">
                  {(defaultsData?.room_overrides || []).length === 0 ? (
                    <div className="text-sm text-gray-500">עדיין לא נשמרו שינויים ידניים. כרגע פועלת ברירת המחדל.</div>
                  ) : (
                    (defaultsData?.room_overrides || []).map((setting) => (
                      <div key={setting.id} className="rounded-md border border-gray-200 p-4 text-sm">
                        <div className="font-medium">{setting.room_name || "אולם"}</div>
                        <div className="mt-2 space-y-2">
                          {setting.weekly_schedule.map((slot) => (
                            <div key={`${setting.id}-${slot.day_of_week}`} className="text-gray-600">
                              <div className="font-medium">{dayLabels[slot.day_of_week]}</div>
                              {slot.entries.length === 0 ? (
                                <div className="text-xs text-gray-400">אין שיבוצים</div>
                              ) : (
                                slot.entries.map((entry) => (
                                  <div key={entry.id || `${entry.start_time}-${entry.end_time}`} className="mr-3 text-xs">
                                    {entry.start_time} - {entry.end_time} | {entry.title}
                                    {entry.note ? ` | ${entry.note}` : ""}
                                  </div>
                                ))
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="text-xs text-gray-500">בתוקף מ-{setting.effective_from}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
