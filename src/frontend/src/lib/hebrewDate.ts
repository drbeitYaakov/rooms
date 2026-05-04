export interface HebrewDateParts {
  dayNumber: number;
  dayLabel: string;
  monthName: string;
  year: number;
}

const hebrewWeekdayFormatter = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
});

const gregorianDateFormatter = new Intl.DateTimeFormat("he-IL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const hebrewFullPartsFormatter = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export const parseIsoDate = (value?: string | null) => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

export const formatIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const compareIsoDates = (left?: string, right?: string) => {
  if (!left || !right) {
    return 0;
  }

  return left.localeCompare(right);
};

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

export const getHebrewDateParts = (date: Date): HebrewDateParts => {
  const parts = hebrewFullPartsFormatter.formatToParts(date);
  const dayValue = Number.parseInt(parts.find((part) => part.type === "day")?.value || "", 10);
  const yearValue = Number.parseInt(parts.find((part) => part.type === "year")?.value || "", 10);
  const monthName = parts.find((part) => part.type === "month")?.value.trim() || "";

  return {
    dayNumber: dayValue,
    dayLabel: toHebrewDayLetters(dayValue),
    monthName,
    year: yearValue,
  };
};

export const formatHebrewDate = (value?: string | null, options?: { includeWeekday?: boolean }) => {
  const date = parseIsoDate(value);
  if (!date) {
    return "";
  }

  const hebrewParts = getHebrewDateParts(date);
  const pieces = [];

  if (options?.includeWeekday) {
    pieces.push(hebrewWeekdayFormatter.format(date));
  }

  pieces.push(`${hebrewParts.dayLabel} ${hebrewParts.monthName}`.trim());

  return pieces.filter(Boolean).join(", ");
};

export const formatGregorianDate = (value?: string | null) => {
  const date = parseIsoDate(value);
  if (!date) {
    return value || "";
  }

  return gregorianDateFormatter.format(date);
};
