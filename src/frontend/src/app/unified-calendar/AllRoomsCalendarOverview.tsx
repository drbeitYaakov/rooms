"use client";

import type { ReactNode } from "react";
import { parseLocalDate } from "./calendarDateUtils";

export interface OverviewDay {
  date: string;
  dayName: string;
  shortDayName: string;
  dayNumber: number;
  hebrewDate: string;
  isToday: boolean;
}

export interface OverviewAssignment {
  id: number | string;
  study_group_name?: string;
  assignment_title?: string;
  activity_type: string;
  start_time: string;
  end_time: string;
}

export interface OverviewRoom {
  room_id: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  homeroom_display_name?: string | null;
}

interface AllRoomsCalendarOverviewProps {
  mode: "weekly_overview" | "monthly_overview";
  rooms: OverviewRoom[];
  days: OverviewDay[];
  getAssignments: (roomId: string, date: string) => OverviewAssignment[];
  getAssignmentLabel: (assignment: OverviewAssignment) => string;
  getActivityTypeColor: (type: string) => string;
  getRoomTypeDisplay: (type: string) => string;
  isHomeroomRoomType: (type: string) => boolean;
  onRoomFocus: (roomId: string) => void;
}

const compactTitles = (assignments: OverviewAssignment[], getAssignmentLabel: (a: OverviewAssignment) => string) => {
  if (assignments.length === 0) {
    return { primary: "פנוי", extra: 0 };
  }
  const primary = getAssignmentLabel(assignments[0]);
  return { primary, extra: assignments.length - 1 };
};

export function AllRoomsCalendarOverview({
  mode,
  rooms,
  days,
  getAssignments,
  getAssignmentLabel,
  getActivityTypeColor,
  getRoomTypeDisplay,
  isHomeroomRoomType,
  onRoomFocus,
}: AllRoomsCalendarOverviewProps) {
  const roomColumnWidth = mode === "monthly_overview" ? 200 : 220;
  const dayMinWidth = mode === "monthly_overview" ? 52 : 96;
  const gridMinWidth = roomColumnWidth + days.length * dayMinWidth;

  return (
    <div className="max-h-[74vh] overflow-auto">
      <div style={{ minWidth: `${gridMinWidth}px` }}>
        <div
          className="sticky top-0 z-30 grid border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur"
          style={{
            gridTemplateColumns: `${roomColumnWidth}px repeat(${days.length}, minmax(${dayMinWidth}px, 1fr))`,
          }}
        >
          <div className="sticky right-0 z-40 border-l border-slate-200 bg-white px-4 py-4">
            <div className="text-xs font-semibold text-slate-400">חדרים</div>
            <div className="mt-1 text-sm font-bold text-slate-900">
              {mode === "weekly_overview" ? "תצוגה שבועית — כל החדרים" : "תצוגה חודשית מורחבת"}
            </div>
          </div>
          {days.map((day) => (
            <div
              key={day.date}
              className={`border-l border-slate-200 px-2 py-3 text-center ${
                day.isToday ? "bg-sky-50" : "bg-slate-50/80"
              }`}
            >
              <div className="text-[10px] font-semibold text-slate-500">{day.shortDayName}</div>
              <div className={`text-sm font-bold ${day.isToday ? "text-sky-800" : "text-slate-900"}`}>{day.dayNumber}</div>
              {mode === "weekly_overview" && (
                <div className="mt-0.5 text-[9px] text-slate-500">{day.hebrewDate}</div>
              )}
            </div>
          ))}
        </div>

        <div className="divide-y divide-slate-200">
          {rooms.map((room) => (
            <div
              key={room.room_id}
              className="grid"
              style={{
                gridTemplateColumns: `${roomColumnWidth}px repeat(${days.length}, minmax(${dayMinWidth}px, 1fr))`,
              }}
            >
              <button
                type="button"
                onClick={() => onRoomFocus(room.room_id)}
                className="sticky right-0 z-20 border-l border-slate-200 bg-white px-4 py-3 text-right transition hover:bg-sky-50"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-sky-800">{room.room_number}</span>
                  {isHomeroomRoomType(room.room_type) && room.homeroom_display_name && (
                    <span className="text-xs font-black text-sky-700">{room.homeroom_display_name}</span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-600">{getRoomTypeDisplay(room.room_type)}</div>
                <div className="mt-1 text-[11px] font-semibold text-sky-700">לחץ להגדלה</div>
              </button>

              {days.map((day) => {
                const assignments = getAssignments(room.room_id, day.date);
                const { primary, extra } = compactTitles(assignments, getAssignmentLabel);
                const occupied = assignments.length > 0;
                const dominantType = assignments[0]?.activity_type ?? "";

                return (
                  <button
                    key={`${room.room_id}-${day.date}`}
                    type="button"
                    onClick={() => onRoomFocus(room.room_id)}
                    title={
                      occupied
                        ? assignments.map((a) => `${getAssignmentLabel(a)} (${a.start_time}-${a.end_time})`).join("\n")
                        : "פנוי"
                    }
                    className={`border-l border-slate-200 p-1.5 text-right transition hover:brightness-95 ${
                      occupied
                        ? `${getActivityTypeColor(dominantType)} opacity-90`
                        : "bg-emerald-50/90 text-emerald-800"
                    }`}
                    style={{ minHeight: mode === "monthly_overview" ? "3.25rem" : "4.5rem" }}
                  >
                    {mode === "monthly_overview" ? (
                      <div className="flex h-full flex-col items-center justify-center gap-0.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${occupied ? "bg-current opacity-80" : "bg-emerald-500"}`}
                        />
                        {occupied && extra > 0 && (
                          <span className="text-[9px] font-bold">+{extra + 1}</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex h-full flex-col justify-between">
                        <span className={`text-[10px] font-bold leading-tight ${occupied ? "" : "text-emerald-800"}`}>
                          {occupied ? primary : "פנוי"}
                        </span>
                        {extra > 0 && <span className="text-[9px] font-semibold opacity-80">+{extra} נוספים</span>}
                        {occupied && (
                          <span className="text-[9px] opacity-75">
                            {assignments[0].start_time}-{assignments[0].end_time}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface RoomFocusPanelProps {
  mode: "weekly_overview" | "monthly_overview";
  room: OverviewRoom;
  days: OverviewDay[];
  getAssignments: (roomId: string, date: string) => OverviewAssignment[];
  getAssignmentLabel: (assignment: OverviewAssignment) => string;
  getActivityTypeColor: (type: string) => string;
  getRoomTypeDisplay: (type: string) => string;
  getActivityTypeText: (type: string) => string;
  isHomeroomRoomType: (type: string) => boolean;
  onClose: () => void;
}

export function RoomFocusPanel({
  mode,
  room,
  days,
  getAssignments,
  getAssignmentLabel,
  getActivityTypeColor,
  getRoomTypeDisplay,
  getActivityTypeText,
  isHomeroomRoomType,
  onClose,
}: RoomFocusPanelProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 py-6" dir="rtl">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <FocusBadge>{mode === "weekly_overview" ? "הגדלת חדר — שבוע" : "הגדלת חדר — חודש"}</FocusBadge>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">חדר {room.room_number}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {getRoomTypeDisplay(room.room_type)}
              {isHomeroomRoomType(room.room_type) && room.homeroom_display_name
                ? ` · ${room.homeroom_display_name}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            חזרה לכל החדרים
          </button>
        </div>

        <div className="overflow-auto p-6">
          {mode === "weekly_overview" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {days.map((day) => {
                const assignments = getAssignments(room.room_id, day.date);
                return (
                  <div
                    key={day.date}
                    className={`rounded-3xl border p-4 ${day.isToday ? "border-sky-200 bg-sky-50/40" : "border-slate-200 bg-slate-50/60"}`}
                  >
                    <div className="text-sm font-semibold text-slate-500">{day.dayName}</div>
                    <div className="text-lg font-bold text-slate-900">{parseLocalDate(day.date).toLocaleDateString("he-IL")}</div>
                    <div className="text-xs text-slate-500">{day.hebrewDate}</div>
                    {assignments.length === 0 ? (
                      <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-3 py-4 text-center text-sm font-semibold text-emerald-800">
                        פנוי
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {assignments.map((assignment) => (
                          <div
                            key={`${assignment.id}-${assignment.start_time}`}
                            className={`rounded-2xl border px-3 py-2 ${getActivityTypeColor(assignment.activity_type)}`}
                          >
                            <div className="text-sm font-bold">{getAssignmentLabel(assignment)}</div>
                            <div className="mt-1 text-xs opacity-90">{getActivityTypeText(assignment.activity_type)}</div>
                            <div className="mt-1 text-xs font-semibold">
                              {assignment.start_time} - {assignment.end_time}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {days.map((day) => {
                const assignments = getAssignments(room.room_id, day.date);
                const occupied = assignments.length > 0;
                return (
                  <div
                    key={day.date}
                    className={`min-h-[7.5rem] rounded-2xl border p-3 ${
                      occupied ? "border-rose-200 bg-rose-50/80" : "border-emerald-200 bg-emerald-50/80"
                    } ${day.isToday ? "ring-2 ring-sky-300" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-slate-900">{day.dayNumber}</span>
                      <span className="text-[10px] text-slate-500">{day.shortDayName}</span>
                    </div>
                    {!occupied ? (
                      <div className="mt-6 text-center text-xs font-semibold text-emerald-800">פנוי</div>
                    ) : (
                      <ul className="mt-2 space-y-1">
                        {assignments.slice(0, 3).map((assignment) => (
                          <li key={`${assignment.id}-${assignment.start_time}`} className="text-[11px] leading-snug text-slate-800">
                            <span className="font-bold">{getAssignmentLabel(assignment)}</span>
                            <span className="text-slate-500"> · {assignment.start_time}</span>
                          </li>
                        ))}
                        {assignments.length > 3 && (
                          <li className="text-[10px] font-semibold text-slate-500">+{assignments.length - 3} נוספים</li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusBadge({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
      {children}
    </div>
  );
}