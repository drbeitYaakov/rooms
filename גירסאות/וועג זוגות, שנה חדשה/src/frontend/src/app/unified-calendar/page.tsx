"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import {
  MAINTENANCE_AFTER_HOURS_MESSAGE,
  shouldShowMaintenanceAlert,
} from "@/lib/afterHoursMaintenance";

interface CalendarCell {
  room_id: string;
  date: string;
  time_slot: string;
  is_occupied: boolean;
  assignment?: DayAssignment;
  assignments?: DayAssignment[];
}

interface DayAssignment {
  id: number | string;
  study_group_name?: string;
  assignment_title?: string;
  assignment_note?: string | null;
  activity_type: string;
  grade?: string;
  start_time: string;
  end_time: string;
  student_count?: number;
  is_manual?: boolean;
  assignable_type?: string;
  is_default_homeroom?: boolean;
}

interface AssignmentEditState {
  assignment: DayAssignment;
  date: string;
  roomId: string;
  startTime: string;
  endTime: string;
}

interface Room {
  room_id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  capacity: number;
  has_projector: boolean;
  is_small: boolean;
  schedule?: Record<string, Record<string, unknown>>;
}

type ViewMode = "week" | "day";
interface AssignmentLaneLayout {
  assignment: DayAssignment;
  lane: number;
}

const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 22;
const TOTAL_MINUTES = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;
const ROOM_COLUMN_WIDTH = 258;
const ASSIGNMENT_CARD_HEIGHT_REM = 5.1;
const ASSIGNMENT_LANE_GAP_REM = 0.6;
const DAY_CELL_BASE_HEIGHT_REM = 6.75;

const dayFormatter = new Intl.DateTimeFormat("he-IL", { weekday: "long" });
const shortDayFormatter = new Intl.DateTimeFormat("he-IL", { weekday: "short" });
const longDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const monthFormatter = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" });
const hebrewDayFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { day: "numeric" });
const hebrewMonthFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", { month: "long" });

const toHebrewDayLetters = (value: number) => {
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל"];

  if (value <= 0 || value > 30) {
    return String(value);
  }

  if (value === 15) {
    return 'ט"ו';
  }

  if (value === 16) {
    return 'ט"ז';
  }

  if (value < 10) {
    return `${ones[value]}'`;
  }

  if (value === 10) {
    return 'י"';
  }

  const tensDigit = Math.floor(value / 10);
  const onesDigit = value % 10;
  const letters = `${tens[tensDigit]}${ones[onesDigit]}`;

  if (letters.length === 1) {
    return `${letters}"`;
  }

  return `${letters.slice(0, -1)}"${letters.slice(-1)}`;
};

const getHebrewDateLabel = (date: Date) => {
  const hebrewDayNumeric = Number.parseInt(hebrewDayFormatter.format(date).replace(/[^\d]/g, ""), 10);
  const hebrewDay = Number.isNaN(hebrewDayNumeric)
    ? hebrewDayFormatter.format(date).replace(/[׳״"'`]/g, "").trim()
    : toHebrewDayLetters(hebrewDayNumeric);
  const hebrewMonth = hebrewMonthFormatter.format(date).trim();
  return `${hebrewDay} ${hebrewMonth}`;
};

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const startOfDisplayedWeek = (date: Date) => {
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const isSameCalendarDay = (a: Date, b: Date) => formatLocalDate(a) === formatLocalDate(b);

const getActivityTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    study_group: "border-sky-200 bg-sky-50 text-sky-800",
    regular_class: "border-emerald-200 bg-emerald-50 text-emerald-800",
    meeting: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
    exam: "border-rose-200 bg-rose-50 text-rose-800",
    event: "border-amber-200 bg-amber-50 text-amber-800",
    לימודים: "border-orange-200 bg-orange-50 text-orange-800",
  };

  return colors[type] || "border-slate-200 bg-slate-100 text-slate-700";
};

const getActivityTypeText = (type: string) => {
  const types: Record<string, string> = {
    study_group: "הקבצה",
    regular_class: "שיעור רגיל",
    meeting: "פגישה",
    exam: "מבחן",
    event: "אירוע",
    לימודים: "כיתת אם",
  };

  return types[type] || type;
};

const getRoomTypeDisplay = (roomType: string) => {
  const types: Record<string, string> = {
    CLASSROOM_A: "כיתת אם א'",
    CLASSROOM_B: "כיתת אם ב'",
    CLASSROOM_C: "כיתת אם ג'",
    CLASSROOM_D: "כיתת אם ד'",
    CLASSROOM_E: "כיתת אם ה'",
    CLASSROOM_F: "כיתת אם ו'",
    computer_lab: 'ממ"ד',
    study_room: "חדר הקבצה",
    music_room: "חדר מוזיקה",
    auditorium: "אולם גדול",
    library: "ספריה",
  };

  return types[roomType] || roomType;
};

const getWingDisplay = (wing: string) => {
  const wings: Record<string, string> = {
    old: "אגף ישן",
    new: "אגף חדש",
  };

  return wings[wing] || wing;
};

const isDefaultHomeroomAssignment = (assignment: DayAssignment) =>
  assignment.id === "default-homeroom" || assignment.is_default_homeroom === true;

const isRenderedAsHomeroom = (assignment: DayAssignment) =>
  assignment.assignable_type === "homeroom" || isDefaultHomeroomAssignment(assignment);

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export default function UnifiedCalendarPage() {
  const { data: session } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [calendarData, setCalendarData] = useState<CalendarCell[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [loading, setLoading] = useState(true);
  const [activeAssignmentMenu, setActiveAssignmentMenu] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentEditState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    room_type: "",
    wing: "",
    floor: "",
  });
  useEffect(() => {
    if (session) {
      void fetchCalendarData();
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      void fetchCalendarData();
    }
  }, [selectedDate, session]);

  useEffect(() => {
    const closeMenu = () => setActiveAssignmentMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);
  const fetchCalendarData = async () => {
    try {
      setLoading(true);

      const weekStart = startOfDisplayedWeek(selectedDate);
      const startDate = addDays(weekStart, -7);
      const endDate = addDays(startDate, 30);

      const response = await authenticatedFetch(
        "/api/calendar/grid?" +
          new URLSearchParams({
            start_date: formatLocalDate(startDate),
            end_date: formatLocalDate(endDate),
          }),
      );

      if (!response.ok) {
        throw new Error("Failed to fetch calendar data");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error("Failed to fetch calendar data");
      }

      setRooms(data.data.rooms);

      const flatCalendarData: CalendarCell[] = [];
      data.data.rooms.forEach((room: Room & { schedule?: Record<string, Record<string, { is_occupied: boolean; assignment?: DayAssignment; assignments?: DayAssignment[] }>> }) => {
        Object.entries(room.schedule || {}).forEach(([date, daySchedule]) => {
          Object.entries(daySchedule || {}).forEach(([timeSlot, slotData]) => {
            flatCalendarData.push({
              room_id: room.room_id,
              date,
              time_slot: timeSlot,
              is_occupied: Boolean(slotData?.is_occupied),
              assignment: slotData?.assignment,
              assignments: Array.isArray(slotData?.assignments) ? slotData.assignments : undefined,
            });
          });
        });
      });

      setCalendarData(flatCalendarData);
    } catch (error) {
      console.error("Error fetching calendar data:", error);
      setActionError("טעינת לוח השנה נכשלה.");
    } finally {
      setLoading(false);
    }
  };

  const getWeekDays = () => {
    const weekStart = startOfDisplayedWeek(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return {
        date: formatLocalDate(date),
        dayName: dayFormatter.format(date),
        shortDayName: shortDayFormatter.format(date),
        dayNumber: date.getDate(),
        hebrewDate: getHebrewDateLabel(date),
        isToday: isSameCalendarDay(date, new Date()),
      };
    });
  };

  const getRoomAssignmentsForDay = (roomId: string, date: string) => {
    const groupedAssignments: Record<string, DayAssignment> = {};

    calendarData
      .filter((cell) => cell.room_id === roomId && cell.date === date && cell.is_occupied)
      .forEach((cell) => {
        const cellAssignments =
          cell.assignments && cell.assignments.length > 0
            ? cell.assignments
            : cell.assignment
              ? [cell.assignment]
              : [];

        if (cellAssignments.length === 0) {
          return;
        }

        cellAssignments.forEach((assignment) => {
          const key = `${assignment.id}-${assignment.start_time}-${assignment.end_time}`;
          groupedAssignments[key] = assignment;
        });
      });

    return Object.values(groupedAssignments).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const getAssignmentPosition = (assignment: DayAssignment) => {
    const [startHour, startMinute] = assignment.start_time.split(":").map(Number);
    const [endHour, endMinute] = assignment.end_time.split(":").map(Number);
    const startMinutes = (startHour - CALENDAR_START_HOUR) * 60 + startMinute;
    const endMinutes = (endHour - CALENDAR_START_HOUR) * 60 + endMinute;

    return {
      left: (startMinutes / TOTAL_MINUTES) * 100,
      width: ((endMinutes - startMinutes) / TOTAL_MINUTES) * 100,
    };
  };

  const getAssignmentLanes = (assignments: DayAssignment[]) => {
    const sortedAssignments = [...assignments].sort((a, b) => {
      const startDiff = toMinutes(a.start_time) - toMinutes(b.start_time);
      if (startDiff !== 0) {
        return startDiff;
      }

      return toMinutes(a.end_time) - toMinutes(b.end_time);
    });

    const laneEndTimes: number[] = [];
    const layout: AssignmentLaneLayout[] = sortedAssignments.map((assignment) => {
      const assignmentStart = toMinutes(assignment.start_time);
      const assignmentEnd = toMinutes(assignment.end_time);

      let laneIndex = laneEndTimes.findIndex((endTime) => endTime <= assignmentStart);
      if (laneIndex === -1) {
        laneIndex = laneEndTimes.length;
        laneEndTimes.push(assignmentEnd);
      } else {
        laneEndTimes[laneIndex] = assignmentEnd;
      }

      return {
        assignment,
        lane: laneIndex,
      };
    });

    return {
      layout,
      laneCount: Math.max(laneEndTimes.length, 1),
    };
  };

  const getAssignmentLabel = (assignment: DayAssignment) =>
    assignment.assignment_title || assignment.study_group_name || getActivityTypeText(assignment.activity_type);

  const getAssignmentMenuKey = (assignment: DayAssignment, roomId: string, date: string) =>
    `${assignment.id}-${roomId}-${date}`;

  const getErrorMessage = async (response: Response) => {
    try {
      const data = await response.json();
      return data.error || data.message || "הפעולה נכשלה";
    } catch {
      return "הפעולה נכשלה";
    }
  };

  const openEditDialog = (assignment: DayAssignment, roomId: string, date: string) => {
    setActionError(null);
    setActiveAssignmentMenu(null);
    setEditingAssignment({
      assignment,
      roomId,
      date,
      startTime: assignment.start_time,
      endTime: assignment.end_time,
    });
  };

  const handleDeleteAssignment = async (assignment: DayAssignment, date: string, roomId: string) => {
    if (false && isDefaultHomeroomAssignment(assignment)) {
      setActionError("כיתת אם דיפולטית עדיין לא ניתנת למחיקה יומית מהלוח.");
      return;
    }

    const confirmed = window.confirm("למחוק את השיבוץ ביום הזה?");
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);
      setActiveAssignmentMenu(null);

      const response = isDefaultHomeroomAssignment(assignment)
        ? await authenticatedFetch(`/api/assignments/homeroom-default?room_id=${roomId}&target_date=${date}`, {
            method: "DELETE",
          })
        : await authenticatedFetch(`/api/assignments/${assignment.id}?target_date=${date}`, {
            method: "DELETE",
          });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      await fetchCalendarData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "מחיקת השיבוץ נכשלה");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAssignmentEdit = async () => {
    if (!editingAssignment) {
      return;
    }

    if (editingAssignment.startTime >= editingAssignment.endTime) {
      setActionError("שעת ההתחלה חייבת להיות מוקדמת משעת הסיום.");
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const response = isDefaultHomeroomAssignment(editingAssignment.assignment)
        ? await authenticatedFetch("/api/assignments/homeroom-default", {
            method: "POST",
            body: JSON.stringify({
              room_id: editingAssignment.roomId,
              target_date: editingAssignment.date,
              start_time: editingAssignment.startTime,
              end_time: editingAssignment.endTime,
            }),
          })
        : await authenticatedFetch(`/api/assignments/${editingAssignment.assignment.id}`, {
            method: "PUT",
            body: JSON.stringify({
              target_date: editingAssignment.date,
              start_time: editingAssignment.startTime,
              end_time: editingAssignment.endTime,
            }),
          });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const editedRoom = rooms.find((room) => room.room_id === editingAssignment.roomId);
      if (
        shouldShowMaintenanceAlert({
          startTime: editingAssignment.startTime,
          endTime: editingAssignment.endTime,
          isAuditorium: String(editedRoom?.room_type || "").toUpperCase() === "AUDITORIUM",
          activityType: editingAssignment.assignment.activity_type,
        })
      ) {
        alert(MAINTENANCE_AFTER_HOURS_MESSAGE);
      }

      setEditingAssignment(null);
      await fetchCalendarData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "עדכון השיבוץ נכשל");
    } finally {
      setActionLoading(false);
    }
  };

  const navigatePeriod = (direction: "prev" | "next") => {
    const amount = viewMode === "week" ? 7 : 1;
    setSelectedDate((current) => addDays(current, direction === "prev" ? -amount : amount));
  };

  const weekDays = getWeekDays();
  const selectedDateKey = formatLocalDate(selectedDate);
  const visibleDays = viewMode === "day" ? weekDays.filter((day) => day.date === selectedDateKey) : weekDays;
  const dayColumnMinWidth = viewMode === "day" ? 1100 : 360;
  const timelineMinWidth = ROOM_COLUMN_WIDTH + visibleDays.length * dayColumnMinWidth;

  const filteredRooms = rooms.filter((room) => {
    if (filters.room_type && room.room_type !== filters.room_type) {
      return false;
    }

    if (filters.wing && room.wing !== filters.wing) {
      return false;
    }

    if (filters.floor && String(room.floor) !== filters.floor) {
      return false;
    }

    return true;
  });

  const visibleAssignments = filteredRooms.flatMap((room) =>
    visibleDays.flatMap((day) => getRoomAssignmentsForDay(room.room_id, day.date)),
  );

  const occupiedRoomCount = filteredRooms.filter((room) =>
    visibleDays.some((day) => getRoomAssignmentsForDay(room.room_id, day.date).length > 0),
  ).length;


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100" dir="rtl">
        <div className="rounded-2xl border border-slate-200 bg-white px-8 py-6 text-slate-600 shadow-sm">
          טוען את לוח השנה...
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.14),_transparent_28%),linear-gradient(180deg,_#f8fbff_0%,_#eef4f7_46%,_#f8fafc_100%)]"
      dir="rtl"
    >
      <div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.28)] backdrop-blur">
          <div className="flex flex-col gap-6">
            <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(14,116,144,0.9))] px-6 py-7 text-white">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-3 inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-sky-100">
                    UNIFIED CALENDAR
                  </div>
                  <h1 className="text-3xl font-bold sm:text-4xl">לוח שנה מאוחד</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                   תצוגת תפוסה לפי יום/ שבוע.
                  </p>
                  
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div className="text-xs text-slate-300">חדרים בתצוגה</div>
                    <div className="mt-2 text-2xl font-bold">{filteredRooms.length}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div className="text-xs text-slate-300">חדרים מאוישים</div>
                    <div className="mt-2 text-2xl font-bold">{occupiedRoomCount}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                    <div className="text-xs text-slate-300">שיבוצים גלויים</div>
                    <div className="mt-2 text-2xl font-bold">{visibleAssignments.length}</div>
                  </div>
                </div>
              </div>
            </section>

            {actionError && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </div>
            )}

            <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      תקופה פעילה
                    </div>
                    <div className="mt-2 text-2xl font-bold text-slate-900"> {weekDays[0].hebrewDate}-{weekDays[6].hebrewDate}</div>
                    <div className="mt-1 text-sm text-slate-500">{monthFormatter.format(selectedDate)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setViewMode("week")}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          viewMode === "week"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        תצוגה שבועית
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("day")}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          viewMode === "day"
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        תצוגה יומית
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date())}
                      className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      היום
                    </button>

                    <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-slate-50">
                      <button
                        type="button"
                        onClick={() => navigatePeriod("prev")}
                        className="px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                      >
                        הקודם
                      </button>
                      <div className="h-6 w-px bg-slate-200" />
                      <button
                        type="button"
                        onClick={() => navigatePeriod("next")}
                        className="px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                      >
                        הבא
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {weekDays.map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDate(parseLocalDate(day.date))}
                      className={`min-w-[20px] rounded-2xl border px-4 py-3 text-right transition ${
                        day.date === selectedDateKey
                          ? "border-sky-200 bg-sky-50 text-sky-900 shadow-sm"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-500">{day.shortDayName}</div>
                      {/* <div className="mt-1 text-lg font-bold">{day.dayNumber}</div> */}
                      <div className="mt-1 text-[11px] font-medium text-slate-500">{day.hebrewDate}</div>
                      {day.isToday && <div className="mt-1 text-[11px] font-semibold text-sky-700">היום</div>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">סינון חדרים</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  <label className="text-sm text-slate-600">
                    סוג חדר
                    <select
                      value={filters.room_type}
                      onChange={(event) => setFilters({ ...filters, room_type: event.target.value })}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                    >
                      <option value="">כל הסוגים</option>
                      <option value="CLASSROOM_A">כיתות אם א'</option>
                      <option value="CLASSROOM_B">כיתות אם ב'</option>
                      <option value="CLASSROOM_C">כיתות אם ג'</option>
                      <option value="CLASSROOM_D">כיתות אם ד'</option>
                      <option value="CLASSROOM_E">כיתות אם ה'</option>
                      <option value="CLASSROOM_F">כיתות אם ו'</option>
                      <option value="computer_lab">ממ"ד</option>
                      <option value="study_room">חדר הקבצה</option>
                    </select>
                  </label>

                  <label className="text-sm text-slate-600">
                    אגף
                    <select
                      value={filters.wing}
                      onChange={(event) => setFilters({ ...filters, wing: event.target.value })}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                    >
                      <option value="">כל האגפים</option>
                      <option value="old">אגף ישן</option>
                      <option value="new">אגף חדש</option>
                    </select>
                  </label>

                  <label className="text-sm text-slate-600">
                    קומה
                    <select
                      value={filters.floor}
                      onChange={(event) => setFilters({ ...filters, floor: event.target.value })}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                    >
                      <option value="">כל הקומות</option>
                      <option value="1">קומה 1</option>
                      <option value="2">קומה 2</option>
                      <option value="3">קומה 3</option>
                      <option value="4">קומה 4</option>
                      <option value="5">קומה 5</option>
                      <option value="6">קומה 6</option>
                    </select>
                  </label>
                </div>
              </div>
            </section>

            <section className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_-36px_rgba(15,23,42,0.35)]">
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">ציר זמן חדרים</h2>
                    <p className="text-sm text-slate-500">
                      {viewMode === "day"
                        ? "פוקוס עמוק על יום בודד עם יותר מרחב לקריאת השיבוצים."
                        : "תצוגה שבועית רחבה שמאפשרת לזהות עומסים ודפוסים במהירות."}
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {CALENDAR_START_HOUR}:00 - {CALENDAR_END_HOUR}:00
                  </div>
                </div>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="px-6 py-14 text-center">
                  <div className="mx-auto max-w-md rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8">
                    <div className="text-lg font-semibold text-slate-900">לא נמצאו חדרים לפי הסינון הנוכחי</div>
                    <div className="mt-2 text-sm text-slate-500">כדאי לנקות אחד מהפילטרים כדי להחזיר חדרים לתצוגה.</div>
                  </div>
                </div>
              ) : (
                <div className="max-h-[72vh] overflow-auto">
                  <div className="min-w-full" style={{ minWidth: `${timelineMinWidth}px` }}>
                    <div
                      className="sticky top-0 z-50 grid border-b border-slate-200 bg-white/95 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur"
                      style={{ gridTemplateColumns: `${ROOM_COLUMN_WIDTH}px repeat(${visibleDays.length}, minmax(${dayColumnMinWidth}px, 1fr))` }}
                    >
                      <div className="sticky right-0 z-40 border-l border-slate-200 bg-white px-5 py-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">חדר</div>
                        <div className="mt-2 text-base font-bold text-slate-900">פרטי חדר</div>
                      </div>

                      {visibleDays.map((day) => {
                        const dayTotalAssignments = filteredRooms.reduce(
                          (count, room) => count + getRoomAssignmentsForDay(room.room_id, day.date).length,
                          0,
                        );

                        return (
                          
                          <div key={day.date} className="border-l border-slate-200 px-4 py-4">
                            <div className="mb-4 flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-500">{day.dayName}</div>
                                <div className="mt-1 text-2xl font-bold text-slate-900">{day.dayNumber}</div>
                                <div className="mt-1 text-xs font-medium text-slate-500">{day.hebrewDate}</div>
                              </div>
                              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                {dayTotalAssignments} שיבוצים
                              </div>
                            </div>

                            <div className="relative h-8 rounded-2xl bg-slate-50" dir="ltr">
                              {Array.from({ length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 }, (_, index) => {
                                const hour = CALENDAR_START_HOUR + index;
                                const position =
                                  ((hour - CALENDAR_START_HOUR) / (CALENDAR_END_HOUR - CALENDAR_START_HOUR)) * 100;

                                return (
                                  <div
                                    key={`${day.date}-hour-${hour}`}
                                    className="absolute inset-y-0"
                                    style={{ left: `${position}%` }}
                                  >
                                    <div className="absolute inset-y-0 w-px bg-slate-200" />
                                    <div className="absolute -translate-x-1/2 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 shadow-sm">
                                      {String(hour).padStart(2, "0")}:00
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="divide-y divide-slate-200">
                      {filteredRooms.map((room) => (
                        <div
                          key={room.room_id}
                          className="grid"
                          style={{ gridTemplateColumns: `${ROOM_COLUMN_WIDTH}px repeat(${visibleDays.length}, minmax(${dayColumnMinWidth}px, 1fr))` }}
                        >
                          <div className="sticky right-0 z-20 border-l border-slate-200 bg-white px-5 py-5">
                            <div className="text-xl font-bold text-slate-900">{room.room_number}</div>
                            <div className="mt-1 text-sm text-slate-600">{getRoomTypeDisplay(room.room_type)}</div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">קומה {room.floor}</span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">{getWingDisplay(room.wing)}</span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1">עד {room.capacity}</span>
                              {room.has_projector && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-700">מקרן</span>}
                            </div>
                          </div>

                          {visibleDays.map((day) => {
                            const assignments = getRoomAssignmentsForDay(room.room_id, day.date);
                            const { layout: assignmentLayouts, laneCount } = getAssignmentLanes(assignments);
                            const dayCellHeightRem =
                              assignments.length === 0
                                ? DAY_CELL_BASE_HEIGHT_REM
                                : Math.max(
                                    DAY_CELL_BASE_HEIGHT_REM,
                                    1 +
                                      laneCount * ASSIGNMENT_CARD_HEIGHT_REM +
                                      Math.max(laneCount - 1, 0) * ASSIGNMENT_LANE_GAP_REM
                                  );

                            return (
                              <div
                                key={`${room.room_id}-${day.date}`}
                                dir="ltr"
                                className="relative overflow-visible border-l border-slate-200 bg-[linear-gradient(180deg,_rgba(248,250,252,0.95),_rgba(255,255,255,1))] px-3 py-3"
                                style={{ minHeight: `${dayCellHeightRem}rem` }}
                              >
                                <div className="pointer-events-none absolute inset-0">
                                  {Array.from({ length: 28 }, (_, index) => {
                                    const position = (index / 28) * 100;
                                    return (
                                      <div
                                        key={`${room.room_id}-${day.date}-slot-${index}`}
                                        className={`absolute inset-y-0 ${index % 2 === 0 ? "w-px bg-slate-200" : "w-px bg-slate-100"}`}
                                        style={{ left: `${position}%` }}
                                      />
                                    );
                                  })}
                                </div>

                                {assignments.length === 0 && (
                                  <div className="flex h-full min-h-[82px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm text-slate-400">
                                    פנוי
                                  </div>
                                )}

                                {assignmentLayouts.map(({ assignment, lane }) => {
                                  const position = getAssignmentPosition(assignment);
                                  const label = getAssignmentLabel(assignment);
                                  const menuKey = getAssignmentMenuKey(assignment, room.room_id, day.date);
                                  const homeroom = isRenderedAsHomeroom(assignment);
                                  const topOffsetRem =
                                    0.9 + lane * (ASSIGNMENT_CARD_HEIGHT_REM + ASSIGNMENT_LANE_GAP_REM);

                                  return (
                                    <div
                                      key={`${assignment.id}-${assignment.start_time}-${assignment.end_time}`}
                                      className={`absolute overflow-visible rounded-2xl border shadow-[0_10px_30px_-18px_rgba(15,23,42,0.5)] ${getActivityTypeColor(
                                        assignment.activity_type,
                                      )}`}
                                      style={{
                                        left: `${position.left}%`,
                                        width: `${Math.max(position.width, 18)}%`,
                                        top: `${topOffsetRem}rem`,
                                        minWidth: homeroom ? "220px" : "240px",
                                        minHeight: homeroom ? "4rem" : "4.75rem",
                                        zIndex: 14 + lane,
                                      }}
                                      title={`${label} (${assignment.start_time}-${assignment.end_time})${assignment.assignment_note ? ` - ${assignment.assignment_note}` : ""}`}
                                    >
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setActionError(null);
                                          setActiveAssignmentMenu(activeAssignmentMenu === menuKey ? null : menuKey);
                                        }}
                                        className="absolute left-2 top-2 z-20 rounded-full border border-white/60 bg-white/90 px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm"
                                      >
                                        ⋯
                                      </button>

                                      {activeAssignmentMenu === menuKey && (
                                        <div
                                          className="absolute left-2 top-9 z-30 min-w-[148px] rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              openEditDialog(assignment, room.room_id, day.date);
                                            }}
                                            className="block w-full px-3 py-2 text-right text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                          >
                                            עריכת שעות
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              void handleDeleteAssignment(assignment, day.date, room.room_id);
                                            }}
                                            className="block w-full px-3 py-2 text-right text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                          >
                                            מחיקה ליום זה
                                          </button>
                                        </div>
                                      )}

                                      <div className={`flex h-full flex-col justify-between px-3 ${homeroom ? "py-1.5" : "py-2"}`} dir="rtl">
                                        <div className="overflow-hidden pl-7 text-sm font-bold leading-4">{label}</div>
                                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold opacity-80" dir="ltr">
                                          <span>{assignment.start_time}</span>
                                          <span>{assignment.end_time}</span>
                                        </div>
                                        {!homeroom && assignment.grade && (
                                          <div className="truncate text-[11px] opacity-75">שכבה {assignment.grade}</div>
                                        )}
                                        {assignment.assignment_note && (
                                          <div className="truncate text-[11px] opacity-75">{assignment.assignment_note}</div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">מקרא</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                {[
                  { type: "study_group", label: "הקבצה" },
                  { type: "regular_class", label: "שיעור רגיל" },
                  { type: "לימודים", label: "כיתת אם" },
                  { type: "meeting", label: "פגישה" },
                  { type: "exam", label: "מבחן" },
                  { type: "event", label: "אירוע" },
                ].map((item) => (
                  <div
                    key={item.type}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${getActivityTypeColor(
                      item.type,
                    )}`}
                  >
                    <span className="h-2.5 w-2.5 rounded-full bg-current opacity-70" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {editingAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">עריכת שיבוץ</h2>
            <p className="mt-1 text-sm text-slate-500">
              {getAssignmentLabel(editingAssignment.assignment)} | {editingAssignment.date}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <label className="text-sm text-slate-700">
                שעת התחלה
                <input
                  type="time"
                  value={editingAssignment.startTime}
                  onChange={(event) =>
                    setEditingAssignment({
                      ...editingAssignment,
                      startTime: event.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-sky-300 focus:bg-white"
                />
              </label>

              <label className="text-sm text-slate-700">
                שעת סיום
                <input
                  type="time"
                  value={editingAssignment.endTime}
                  onChange={(event) =>
                    setEditingAssignment({
                      ...editingAssignment,
                      endTime: event.target.value,
                    })
                  }
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 outline-none transition focus:border-sky-300 focus:bg-white"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingAssignment(null);
                  setActionError(null);
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                disabled={actionLoading}
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAssignmentEdit()}
                className="rounded-2xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={actionLoading}
              >
                {actionLoading ? "שומר..." : "שמירת שעות"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
