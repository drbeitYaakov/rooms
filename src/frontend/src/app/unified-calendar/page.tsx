"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";
import {
  MAINTENANCE_AFTER_HOURS_MESSAGE,
  shouldShowMaintenanceAlert,
} from "@/lib/afterHoursMaintenance";
import {
  getActivityTypeColorClass,
  getActivityTypeText as getDisplayActivityTypeText,
} from "@/lib/activityDisplay";

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
  homeroom_display_name?: string | null;
  schedule?: Record<string, Record<string, unknown>>;
}

interface AssignmentLaneLayout {
  assignment: DayAssignment;
  lane: number;
}

interface SelectedCellState {
  roomId: string;
  date: string;
  assignmentId?: string;
}

type ViewMode = "week" | "day";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://rooms-ma9h.onrender.com";

const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 22;
const TOTAL_MINUTES = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;
const ROOM_COLUMN_WIDTH = 248;
const ASSIGNMENT_BAR_HEIGHT_REM = 1.15;
const ASSIGNMENT_LANE_GAP_REM = 0.34;
const DAY_CELL_BASE_HEIGHT_REM = 4.6;
const MIN_BAR_WIDTH_PERCENT = 2.8;

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
const getActivityTypeColor = (type: string) => getActivityTypeColorClass(type);
const getActivityTypeText = (type: string) => getDisplayActivityTypeText(type);

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

const isHomeroomRoomType = (roomType: string) => roomType.startsWith("CLASSROOM_");

const normalizeWingValue = (wing?: string | null): string => {
  const normalized = String(wing || "").trim().toUpperCase();

  if (normalized === "NEW" || normalized === "CENTER") {
    return "new";
  }

  if (normalized === "OLD" || normalized === "LEFT" || normalized === "RIGHT") {
    return "old";
  }

  return String(wing || "").trim().toLowerCase();
};

const getWingDisplay = (wing: string) => {
  const wings: Record<string, string> = {
    old: "אגף ישן",
    new: "אגף חדש",
  };

  const normalizedWing = normalizeWingValue(wing);
  return wings[normalizedWing] || wing;
};

const getDayColumnSurface = (index: number) =>
  index % 2 === 0
    ? "bg-[linear-gradient(180deg,_rgba(248,250,252,0.96),_rgba(255,255,255,1))]"
    : "bg-[linear-gradient(180deg,_rgba(241,245,249,0.92),_rgba(248,250,252,0.98))]";

const getDayColumnBorder = (index: number) =>
  index % 2 === 0 ? "border-l-2 border-l-slate-300" : "border-l-2 border-l-sky-100";

const isDefaultHomeroomAssignment = (assignment: DayAssignment) =>
  assignment.id === "default-homeroom" || assignment.is_default_homeroom === true;

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
  const [editingAssignment, setEditingAssignment] = useState<AssignmentEditState | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCellState | null>(null);
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

  const fetchCalendarData = async () => {
    try {
      setLoading(true);

      const weekStart = startOfDisplayedWeek(selectedDate);
      const startDate = addDays(weekStart, -7);
      const endDate = addDays(startDate, 30);

      const response = await authenticatedFetch(
        `${API_BASE_URL}/api/calendar/grid?` +
          new URLSearchParams({
            start_date: formatLocalDate(startDate),
            end_date: formatLocalDate(endDate),
          }),
      );

      if (!response.ok) {
        throw new Error("טעינת נתוני היומן נכשלה");
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error("טעינת נתוני היומן נכשלה");
      }

      setRooms(data.data.rooms);

      const flatCalendarData: CalendarCell[] = [];
      data.data.rooms.forEach(
        (room: Room & {
          schedule?: Record<
            string,
            Record<string, { is_occupied: boolean; assignment?: DayAssignment; assignments?: DayAssignment[] }>
          >;
        }) => {
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
        },
      );

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

        cellAssignments.forEach((assignment) => {
          const key = `${assignment.id}-${assignment.start_time}-${assignment.end_time}`;
          groupedAssignments[key] = assignment;
        });
      });

    return Object.values(groupedAssignments).sort((a, b) => a.start_time.localeCompare(b.start_time));
  };

  const getAssignmentPosition = (assignment: DayAssignment) => {
    const startMinutes = Math.max(0, toMinutes(assignment.start_time) - CALENDAR_START_HOUR * 60);
    const endMinutes = Math.min(TOTAL_MINUTES, toMinutes(assignment.end_time) - CALENDAR_START_HOUR * 60);

    return {
      left: (startMinutes / TOTAL_MINUTES) * 100,
      width: Math.max(((endMinutes - startMinutes) / TOTAL_MINUTES) * 100, MIN_BAR_WIDTH_PERCENT),
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
    setEditingAssignment({
      assignment,
      roomId,
      date,
      startTime: assignment.start_time,
      endTime: assignment.end_time,
    });
  };

  const handleDeleteAssignment = async (assignment: DayAssignment, date: string, roomId: string) => {
    const confirmed = window.confirm("למחוק את השיבוץ ביום הזה?");
    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(true);
      setActionError(null);

      const response = isDefaultHomeroomAssignment(assignment)
        ? await authenticatedFetch(`${API_BASE_URL}/api/assignments/homeroom-default?room_id=${roomId}&target_date=${date}`, {
            method: "DELETE",
          })
        : await authenticatedFetch(`${API_BASE_URL}/api/assignments/${assignment.id}?target_date=${date}`, {
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
        ? await authenticatedFetch(`${API_BASE_URL}/api/assignments/homeroom-default`, {
            method: "POST",
            body: JSON.stringify({
              room_id: editingAssignment.roomId,
              target_date: editingAssignment.date,
              start_time: editingAssignment.startTime,
              end_time: editingAssignment.endTime,
            }),
          })
        : await authenticatedFetch(`${API_BASE_URL}/api/assignments/${editingAssignment.assignment.id}`, {
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
  const dayColumnMinWidth = viewMode === "day" ? 900 : 300;
  const timelineMinWidth = ROOM_COLUMN_WIDTH + visibleDays.length * dayColumnMinWidth;

  const filteredRooms = rooms.filter((room) => {
    if (filters.room_type && room.room_type !== filters.room_type) {
      return false;
    }

    if (filters.wing && normalizeWingValue(room.wing) !== filters.wing) {
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

  useEffect(() => {
    if (filteredRooms.length === 0 || visibleDays.length === 0) {
      setSelectedCell(null);
      return;
    }

    if (
      selectedCell &&
      filteredRooms.some((room) => room.room_id === selectedCell.roomId) &&
      visibleDays.some((day) => day.date === selectedCell.date)
    ) {
      return;
    }

    setSelectedCell({
      roomId: filteredRooms[0].room_id,
      date: visibleDays[0].date,
    });
  }, [filteredRooms, visibleDays, selectedCell]);

  const selectedRoom = selectedCell
    ? filteredRooms.find((room) => room.room_id === selectedCell.roomId) ?? null
    : null;
  const selectedAssignments =
    selectedCell && selectedRoom ? getRoomAssignmentsForDay(selectedCell.roomId, selectedCell.date) : [];

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
      <div className="mx-auto w-full max-w-[1880px] px-4 py-6 sm:px-6 lg:px-8">
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
                    פסי זמן מדויקים בלוח, ופירוט מלא בפאנל צדדי כדי לשמור על מסך נקי וברור.
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
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {weekDays[0].hebrewDate} - {weekDays[6].hebrewDate}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{monthFormatter.format(selectedDate)}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                      <button
                        type="button"
                        onClick={() => setViewMode("week")}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          viewMode === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        תצוגה שבועית
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("day")}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          viewMode === "day" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
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
                      className={`min-w-[120px] rounded-2xl border px-4 py-3 text-right transition ${
                        day.date === selectedDateKey
                          ? "border-sky-200 bg-sky-50 text-sky-900 shadow-sm"
                          : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white"
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-500">{day.shortDayName}</div>
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

            <section className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_-36px_rgba(15,23,42,0.35)]">
                <div className="border-b border-slate-200 px-6 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">ציר זמן חדרים</h2>
                      <p className="text-sm text-slate-500">
                        {viewMode === "day"
                          ? "תצוגה יומית ממוקדת עם פסי זמן מדויקים לכל שיבוץ."
                          : "תצוגה שבועית נקייה לזיהוי מהיר של עומסים ופנאי."}
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
                  <div className="max-h-[74vh] overflow-auto">
                    <div className="min-w-full" style={{ minWidth: `${timelineMinWidth}px` }}>
                      <div
                        className="sticky top-0 z-50 grid border-b border-slate-200 bg-white/95 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] backdrop-blur"
                        style={{
                          gridTemplateColumns: `${ROOM_COLUMN_WIDTH}px repeat(${visibleDays.length}, minmax(${dayColumnMinWidth}px, 1fr))`,
                        }}
                      >
                        <div className="sticky right-0 z-40 border-l border-slate-200 bg-white px-5 py-5">
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">חדר</div>
                          <div className="mt-2 text-base font-bold text-slate-900">פרטי חדר</div>
                        </div>

                        {visibleDays.map((day, dayIndex) => {
                          const dayTotalAssignments = filteredRooms.reduce(
                            (count, room) => count + getRoomAssignmentsForDay(room.room_id, day.date).length,
                            0,
                          );
                          const isSelectedDay = selectedCell?.date === day.date;

                          return (
                            <div
                              key={day.date}
                              className={`px-4 py-4 ${getDayColumnBorder(dayIndex)} ${
                                isSelectedDay
                                  ? "bg-sky-50/70 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.32)]"
                                  : getDayColumnSurface(dayIndex)
                              }`}
                            >
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-semibold text-slate-500">{day.dayName}</div>
                                  <div className="mt-1 text-2xl font-bold text-slate-900">{day.dayNumber}</div>
                                  <div className="mt-1 text-xs font-medium text-slate-500">{day.hebrewDate}</div>
                                </div>
                                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                                  {dayTotalAssignments} שיבוצים
                                </div>
                              </div>

                              <div
                                className={`relative h-9 rounded-2xl ${
                                  dayIndex % 2 === 0 ? "bg-white/80" : "bg-slate-100/85"
                                }`}
                                dir="ltr"
                              >
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
                            style={{
                              gridTemplateColumns: `${ROOM_COLUMN_WIDTH}px repeat(${visibleDays.length}, minmax(${dayColumnMinWidth}px, 1fr))`,
                            }}
                          >
                            <div className="sticky right-0 z-20 border-l border-slate-200 bg-white px-5 py-5">
                              <div className="text-lg font-bold text-slate-900">{room.room_number}</div>
                              <div className="mt-1 text-sm text-slate-600">{getRoomTypeDisplay(room.room_type)}</div>
                              {isHomeroomRoomType(room.room_type) && room.homeroom_display_name && (
                                <div className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                                  משויכת ל{room.homeroom_display_name}
                                </div>
                              )}
                              <div className="mt-3 space-y-1 text-xs text-slate-500">
                                <div>קומה {room.floor} · {getWingDisplay(room.wing)}</div>
                                <div>עד {room.capacity} תלמידים</div>
                                {room.has_projector && <div className="font-semibold text-sky-700">כולל מקרן</div>}
                              </div>
                            </div>

                            {visibleDays.map((day, dayIndex) => {
                              const assignments = getRoomAssignmentsForDay(room.room_id, day.date);
                              const { layout: assignmentLayouts, laneCount } = getAssignmentLanes(assignments);
                              const isSelectedCell =
                                selectedCell?.roomId === room.room_id && selectedCell?.date === day.date;
                              const dayCellHeightRem = Math.max(
                                DAY_CELL_BASE_HEIGHT_REM,
                                1.55 + laneCount * ASSIGNMENT_BAR_HEIGHT_REM + Math.max(laneCount - 1, 0) * ASSIGNMENT_LANE_GAP_REM,
                              );

                              return (
                                <button
                                  key={`${room.room_id}-${day.date}`}
                                  type="button"
                                  dir="ltr"
                                  onClick={() =>
                                    setSelectedCell({
                                      roomId: room.room_id,
                                      date: day.date,
                                    })
                                  }
                                  className={`relative px-3 py-3 text-right transition ${getDayColumnBorder(dayIndex)} ${
                                    isSelectedCell
                                      ? "border-sky-200 bg-sky-50/60 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)]"
                                      : `${getDayColumnSurface(dayIndex)} hover:brightness-[0.985]`
                                  }`}
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

                                  <div className="relative flex h-full flex-col justify-between">
                                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                                      <span>{assignments.length > 0 ? `${assignments.length} שיבוצים` : "פנוי"}</span>
                                      <span>{day.shortDayName}</span>
                                    </div>

                                    <div className="relative" style={{ minHeight: `${dayCellHeightRem - 1.75}rem` }}>
                                      {assignments.length === 0 && (
                                        <div className="absolute inset-0 rounded-2xl border border-dashed border-slate-200 bg-white/55" />
                                      )}

                                      {assignmentLayouts.map(({ assignment, lane }) => {
                                        const position = getAssignmentPosition(assignment);
                                        const label = getAssignmentLabel(assignment);
                                        const isSelectedAssignment =
                                          isSelectedCell && selectedCell?.assignmentId === String(assignment.id);
                                        const showInlineLabel = position.width >= 16;

                                        return (
                                          <button
                                            key={`${assignment.id}-${assignment.start_time}-${assignment.end_time}`}
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setSelectedCell({
                                                roomId: room.room_id,
                                                date: day.date,
                                                assignmentId: String(assignment.id),
                                              });
                                            }}
                                            className={`absolute flex items-center rounded-full border-2 px-2.5 text-[10px] font-semibold shadow-[0_8px_18px_-12px_rgba(15,23,42,0.55)] transition hover:brightness-[0.99] ${getActivityTypeColor(
                                              assignment.activity_type,
                                            )} ${isSelectedAssignment ? "ring-2 ring-sky-300 ring-offset-2" : ""}`}
                                            style={{
                                              left: `${position.left}%`,
                                              width: `${position.width}%`,
                                              top: `${0.35 + lane * (ASSIGNMENT_BAR_HEIGHT_REM + ASSIGNMENT_LANE_GAP_REM)}rem`,
                                              height: `${ASSIGNMENT_BAR_HEIGHT_REM + 0.08}rem`,
                                              zIndex: 10 + lane,
                                            }}
                                            title={`${label} (${assignment.start_time}-${assignment.end_time})`}
                                          >
                                            {showInlineLabel ? (
                                              <span className="truncate text-right leading-none" dir="rtl">
                                                {label}
                                              </span>
                                            ) : (
                                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                                            )}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <aside className="rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_60px_-36px_rgba(15,23,42,0.35)] 2xl:sticky 2xl:top-6 2xl:self-start">
                <div className="border-b border-slate-200 px-5 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">פירוט שיבוצים</div>
                  {selectedRoom && selectedCell ? (
                    <>
                      <h3 className="mt-2 text-xl font-bold text-slate-900">חדר {selectedRoom.room_number}</h3>
                      <div className="mt-1 text-sm text-slate-500">
                        {longDateFormatter.format(parseLocalDate(selectedCell.date))} · {getRoomTypeDisplay(selectedRoom.room_type)}
                      </div>
                    </>
                  ) : (
                    <h3 className="mt-2 text-xl font-bold text-slate-900">בחר משבצת בלוח</h3>
                  )}
                </div>

                <div className="p-5">
                  {!selectedRoom || !selectedCell ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
                      לחץ על תא או על פס זמן כדי לראות פירוט מדויק בצד.
                    </div>
                  ) : selectedAssignments.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50 px-5 py-8 text-center">
                      <div className="text-lg font-semibold text-emerald-800">אין שיבוצים ביום הזה</div>
                      <div className="mt-2 text-sm text-emerald-700">החדר פנוי לאורך כל טווח השעות המוצג.</div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedAssignments.map((assignment) => {
                        const isFocused = selectedCell.assignmentId === String(assignment.id);

                        return (
                          <div
                            key={`${assignment.id}-${assignment.start_time}-${assignment.end_time}`}
                            className={`rounded-3xl border p-4 transition ${
                              isFocused ? "border-sky-300 bg-sky-50/70 shadow-sm" : "border-slate-200 bg-slate-50/70"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedCell({
                                  roomId: selectedCell.roomId,
                                  date: selectedCell.date,
                                  assignmentId: String(assignment.id),
                                })
                              }
                              className="w-full text-right"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-base font-bold text-slate-900">{getAssignmentLabel(assignment)}</div>
                                  <div className="mt-1 text-sm text-slate-500">{getActivityTypeText(assignment.activity_type)}</div>
                                </div>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getActivityTypeColor(assignment.activity_type)}`}>
                                  {assignment.start_time} - {assignment.end_time}
                                </span>
                              </div>
                            </button>

                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                              {assignment.grade && <span className="rounded-full bg-white px-2.5 py-1">שכבה {assignment.grade}</span>}
                              {assignment.student_count != null && (
                                <span className="rounded-full bg-white px-2.5 py-1">{assignment.student_count} תלמידים</span>
                              )}
                              {assignment.is_manual && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">שיבוץ ידני</span>}
                            </div>

                            {assignment.assignment_note && (
                              <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">
                                {assignment.assignment_note}
                              </div>
                            )}

                            <div className="mt-4 flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditDialog(assignment, selectedCell.roomId, selectedCell.date)}
                                className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                                disabled={actionLoading}
                              >
                                עריכת שעות
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteAssignment(assignment, selectedCell.date, selectedCell.roomId)}
                                className="rounded-2xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
                                disabled={actionLoading}
                              >
                                מחיקה ליום זה
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedRoom && selectedCell && (
                    <div className="mt-5 rounded-3xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
                      <div className="font-semibold text-slate-900">פרטי חדר</div>
                      <div className="mt-2">{getRoomTypeDisplay(selectedRoom.room_type)}</div>
                      {isHomeroomRoomType(selectedRoom.room_type) && selectedRoom.homeroom_display_name && (
                        <div className="mt-2 inline-flex items-center rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700">
                          כיתת אם משויכת: {selectedRoom.homeroom_display_name}
                        </div>
                      )}
                      <div className="mt-1">
                        קומה {selectedRoom.floor} · {getWingDisplay(selectedRoom.wing)}
                      </div>
                      <div className="mt-1">קיבולת עד {selectedRoom.capacity}</div>
                    </div>
                  )}
                </div>
              </aside>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">מקרא</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                {[
                  { type: "study_group", label: "הקבצה" },
                  { type: "regular_class", label: "שיעור רגיל" },
                  { type: "homeroom", label: "כיתת אם" },
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
