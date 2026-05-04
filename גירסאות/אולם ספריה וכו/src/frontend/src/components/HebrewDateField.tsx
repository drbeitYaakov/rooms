"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareIsoDates,
  formatGregorianDate,
  formatHebrewDate,
  formatIsoDate,
  getHebrewDateParts,
  parseIsoDate,
} from "@/lib/hebrewDate";

interface HebrewDateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  required?: boolean;
  className?: string;
  inputClassName?: string;
}

interface HebrewMonthBucket {
  key: string;
  monthName: string;
  year: number;
  startIso: string;
  endIso: string;
}

const WEEKDAY_LABELS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date) => {
  const current = new Date(date);
  current.setDate(current.getDate() - current.getDay());
  return current;
};

const endOfWeek = (date: Date) => addDays(startOfWeek(date), 6);

const buildHebrewMonths = (rangeStart: Date, rangeEnd: Date) => {
  const months: HebrewMonthBucket[] = [];
  let current = new Date(rangeStart);
  let activeMonth: HebrewMonthBucket | null = null;

  while (current <= rangeEnd) {
    const iso = formatIsoDate(current);
    const hebrew = getHebrewDateParts(current);
    const key = `${hebrew.year}-${hebrew.monthName}`;

    if (!activeMonth || activeMonth.key !== key) {
      activeMonth = {
        key,
        monthName: hebrew.monthName,
        year: hebrew.year,
        startIso: iso,
        endIso: iso,
      };
      months.push(activeMonth);
    } else {
      activeMonth.endIso = iso;
    }

    current = addDays(current, 1);
  }

  return months;
};

export default function HebrewDateField({
  label,
  value,
  onChange,
  min,
  required = false,
  className,
  inputClassName,
}: HebrewDateFieldProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const todayIso = formatIsoDate(new Date());
  const effectiveAnchor = value || min || todayIso;
  const anchorDate = parseIsoDate(effectiveAnchor) ?? new Date();
  const [isOpen, setIsOpen] = useState(false);

  const months = useMemo(() => {
    const rangeStart = addDays(anchorDate, -540);
    const rangeEnd = addDays(anchorDate, 540);
    return buildHebrewMonths(rangeStart, rangeEnd);
  }, [anchorDate]);

  const selectedMonthKey = useMemo(() => {
    const selectedDate = parseIsoDate(effectiveAnchor) ?? new Date();
    const hebrew = getHebrewDateParts(selectedDate);
    return `${hebrew.year}-${hebrew.monthName}`;
  }, [effectiveAnchor]);

  const [activeMonthKey, setActiveMonthKey] = useState(selectedMonthKey);

  useEffect(() => {
    setActiveMonthKey(selectedMonthKey);
  }, [selectedMonthKey]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const activeMonthIndex = Math.max(
    months.findIndex((month) => month.key === activeMonthKey),
    0,
  );
  const activeMonth = months[activeMonthIndex] ?? months[0];

  const activeMonthStart = parseIsoDate(activeMonth?.startIso || effectiveAnchor) ?? anchorDate;
  const activeMonthEnd = parseIsoDate(activeMonth?.endIso || effectiveAnchor) ?? anchorDate;
  const gridStart = startOfWeek(activeMonthStart);
  const gridEnd = endOfWeek(activeMonthEnd);

  const gridDates = useMemo(() => {
    const dates: string[] = [];
    let current = new Date(gridStart);

    while (current <= gridEnd) {
      dates.push(formatIsoDate(current));
      current = addDays(current, 1);
    }

    return dates;
  }, [gridStart, gridEnd]);

  const weeks = [];
  for (let index = 0; index < gridDates.length; index += 7) {
    weeks.push(gridDates.slice(index, index + 7));
  }

  const hebrewDisplay = value ? formatHebrewDate(value, { includeWeekday: true }) : "טרם נבחר תאריך";
  const gregorianDisplay = value ? formatGregorianDate(value) : "לא נבחר תאריך";

  return (
    <div className={className} ref={rootRef}>
      <label className="mb-2 block text-sm font-medium text-slate-700">{label}</label>

      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-right shadow-sm transition hover:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
      >
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">לוח עברי</div>
        <div className="mt-1 text-base font-semibold text-slate-900">{hebrewDisplay}</div>
        <div className="mt-1 text-xs text-slate-500">תאריך מערכת: {gregorianDisplay}</div>
      </button>

      {isOpen && activeMonth && (
        <div className="relative z-30 mt-3 rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.4)]">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setActiveMonthKey(months[Math.max(activeMonthIndex - 1, 0)].key)}
              disabled={activeMonthIndex === 0}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              חודש קודם
            </button>

            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">
                {activeMonth.monthName} {activeMonth.year}
              </div>
              <div className="text-xs text-slate-500">
                {formatGregorianDate(activeMonth.startIso)} - {formatGregorianDate(activeMonth.endIso)}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveMonthKey(months[Math.min(activeMonthIndex + 1, months.length - 1)].key)}
              disabled={activeMonthIndex === months.length - 1}
              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              חודש הבא
            </button>
          </div>

          <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-500">
            {WEEKDAY_LABELS.map((weekday) => (
              <div key={weekday} className="rounded-xl bg-slate-50 px-2 py-2">
                {weekday}
              </div>
            ))}
          </div>

          <div className="mt-2 space-y-2">
            {weeks.map((week, weekIndex) => (
              <div key={`week-${weekIndex}`} className="grid grid-cols-7 gap-2">
                {week.map((isoDate) => {
                  const date = parseIsoDate(isoDate) ?? anchorDate;
                  const hebrew = getHebrewDateParts(date);
                  const inActiveMonth =
                    compareIsoDates(isoDate, activeMonth.startIso) >= 0 && compareIsoDates(isoDate, activeMonth.endIso) <= 0;
                  const isDisabled = min ? compareIsoDates(isoDate, min) < 0 : false;
                  const isSelected = isoDate === value;
                  const isToday = isoDate === todayIso;

                  return (
                    <button
                      key={isoDate}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => {
                        onChange(isoDate);
                        setIsOpen(false);
                      }}
                      className={`rounded-2xl border px-2 py-3 text-center transition ${
                        isSelected
                          ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                          : inActiveMonth
                            ? "border-slate-200 bg-white text-slate-800 hover:border-sky-200 hover:bg-sky-50/60"
                            : "border-slate-100 bg-slate-50 text-slate-400"
                      } ${isDisabled ? "cursor-not-allowed opacity-40" : ""}`}
                    >
                      <div className="text-sm font-bold">{hebrew.dayLabel}</div>
                      <div className="mt-1 text-[11px]">{date.getDate()}</div>
                      {isToday && <div className="mt-1 text-[10px] font-semibold text-emerald-600">היום</div>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            הבחירה בלוח היא עברית, אך הערך שנשמר ונשלח לפונקציות נשאר תאריך לועזי מלא.
          </div>
        </div>
      )}

      <input
        type="text"
        readOnly
        tabIndex={-1}
        value={value}
        aria-hidden="true"
        className={inputClassName ? `${inputClassName} sr-only` : "sr-only"}
        required={required}
      />
    </div>
  );
}
