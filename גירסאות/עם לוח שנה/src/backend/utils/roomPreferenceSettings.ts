import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { isMamadRoom } from '../domain/models/Room';

export const ROOM_PRIORITY_SETTINGS_KEY = 'room_priority_preferences';
export const ROOM_PRIORITY_TYPES = [
  'homeroom',
  'study_room',
  'mamad',
  'library',
  'music_room',
  'caravan',
  'other',
  'auditorium'
] as const;

export type RoomPriorityType = typeof ROOM_PRIORITY_TYPES[number];

export interface RoomPriorityDefaultSetting {
  room_type: RoomPriorityType;
  room_ids: string[];
}

export interface RoomPriorityTimeOverrideSetting {
  id: string;
  room_type: RoomPriorityType;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  room_ids: string[];
}

export interface RoomPrioritySettingsPayload {
  defaults: RoomPriorityDefaultSetting[];
  overrides: RoomPriorityTimeOverrideSetting[];
}

const DEFAULT_SETTINGS: RoomPrioritySettingsPayload = {
  defaults: [],
  overrides: []
};

export const ROOM_PRIORITY_TYPE_LABELS: Record<RoomPriorityType, string> = {
  homeroom: 'כיתות אם',
  study_room: 'חדרי הקבצה',
  mamad: 'ממ"דים',
  library: 'ספריה',
  music_room: 'חדר מוזיקה',
  caravan: 'קרוואנים',
  other: 'חדרים כלליים',
  auditorium: 'אולם'
};

const normalizeText = (value?: string | null): string =>
  String(value || '').trim().toLowerCase();

const isTimeValue = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

const overlapsTimeRange = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
) => startA < endB && startB < endA;

const timeToMinutes = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};

const normalizeRoomIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item || '').trim())
        .filter((item) => item !== '')
    : [];

const normalizeDaysOfWeek = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((left, right) => left - right);
};

export const normalizeRoomPriorityType = (value: unknown): RoomPriorityType | null => {
  const normalized = normalizeText(typeof value === 'string' ? value : String(value || ''));
  return ROOM_PRIORITY_TYPES.includes(normalized as RoomPriorityType)
    ? normalized as RoomPriorityType
    : null;
};

export const classifyRoomPriorityType = (room: {
  room_type?: string | null;
  notes?: string | null;
  room_number?: string | null;
  grade_level?: number | null;
}): RoomPriorityType => {
  const roomType = normalizeText(room.room_type);
  const notes = normalizeText(room.notes);
  const roomNumber = String(room.room_number || '').trim();

  if (roomType.includes('auditorium') || notes.includes('אולם') || normalizeText(roomNumber).includes('אולם')) {
    return 'auditorium';
  }

  if (roomType.includes('library') || notes.includes('ספר')) {
    return 'library';
  }

  if (roomType.includes('music') || notes.includes('מוזיקה')) {
    return 'music_room';
  }

  if (
    roomType.includes('caravan') ||
    roomType.includes('corridor') ||
    notes.includes('קרוון') ||
    notes.includes('קרוונים')
  ) {
    return 'caravan';
  }

  if (
    roomType.includes('study') ||
    roomType.includes('group') ||
    roomType === 'study' ||
    notes.includes('הקבצה')
  ) {
    return 'study_room';
  }

  if (
    roomType.includes('mamad') ||
    roomType.includes('computer') ||
    isMamadRoom(roomNumber) ||
    notes.includes('ממ"ד') ||
    notes.includes('ממד')
  ) {
    return 'mamad';
  }

  if (
    roomType.includes('homeroom') ||
    roomType.includes('classroom') ||
    roomType === 'regular' ||
    roomType.startsWith('classroom_') ||
    room.grade_level
  ) {
    return 'homeroom';
  }

  return 'other';
};

const normalizeDefaultSetting = (value: unknown): RoomPriorityDefaultSetting | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const roomType = normalizeRoomPriorityType((value as any).room_type);
  if (!roomType) {
    return null;
  }

  return {
    room_type: roomType,
    room_ids: normalizeRoomIds((value as any).room_ids)
  };
};

const normalizeOverrideSetting = (value: unknown): RoomPriorityTimeOverrideSetting | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const roomType = normalizeRoomPriorityType((value as any).room_type);
  const startTime = (value as any).start_time;
  const endTime = (value as any).end_time;

  if (!roomType || !isTimeValue(startTime) || !isTimeValue(endTime) || startTime >= endTime) {
    return null;
  }

  return {
    id: typeof (value as any).id === 'string' && (value as any).id.trim() !== '' ? (value as any).id : randomUUID(),
    room_type: roomType,
    days_of_week: normalizeDaysOfWeek((value as any).days_of_week),
    start_time: startTime,
    end_time: endTime,
    room_ids: normalizeRoomIds((value as any).room_ids)
  };
};

export const loadRoomPrioritySettings = async (
  trx: Knex | Knex.Transaction
): Promise<RoomPrioritySettingsPayload> => {
  const row = await trx('settings')
    .select('value')
    .where({ key: ROOM_PRIORITY_SETTINGS_KEY })
    .first();

  const payload = (row?.value ?? {}) as Partial<RoomPrioritySettingsPayload>;

  return {
    defaults: Array.isArray(payload.defaults)
      ? payload.defaults.map(normalizeDefaultSetting).filter((item): item is RoomPriorityDefaultSetting => item !== null)
      : [],
    overrides: Array.isArray(payload.overrides)
      ? payload.overrides.map(normalizeOverrideSetting).filter((item): item is RoomPriorityTimeOverrideSetting => item !== null)
      : []
  };
};

export const saveRoomPrioritySettings = async (
  trx: Knex | Knex.Transaction,
  payload: RoomPrioritySettingsPayload
) => {
  const normalizedPayload: RoomPrioritySettingsPayload = {
    defaults: payload.defaults
      .map((item) => normalizeDefaultSetting(item))
      .filter((item): item is RoomPriorityDefaultSetting => item !== null),
    overrides: payload.overrides
      .map((item) => normalizeOverrideSetting(item))
      .filter((item): item is RoomPriorityTimeOverrideSetting => item !== null)
  };

  const existing = await trx('settings')
    .select('id')
    .where({ key: ROOM_PRIORITY_SETTINGS_KEY })
    .first();

  if (existing) {
    await trx('settings')
      .where({ key: ROOM_PRIORITY_SETTINGS_KEY })
      .update({
        value: JSON.stringify(normalizedPayload),
        updatedAt: trx.fn.now()
      });
    return;
  }

  await trx('settings').insert({
    id: randomUUID(),
    key: ROOM_PRIORITY_SETTINGS_KEY,
    value: JSON.stringify(normalizedPayload),
    createdAt: trx.fn.now(),
    updatedAt: trx.fn.now()
  });
};

export const resolveRoomPriorityOrder = (
  settings: RoomPrioritySettingsPayload,
  input: {
    room_type: RoomPriorityType;
    date: string;
    start_time: string;
    end_time: string;
  }
): string[] => {
  const dayOfWeek = new Date(`${input.date}T00:00:00`).getDay();

  const matchingOverride = [...settings.overrides]
    .filter((override) => {
      if (override.room_type !== input.room_type) {
        return false;
      }

      if (override.days_of_week.length > 0 && !override.days_of_week.includes(dayOfWeek)) {
        return false;
      }

      return overlapsTimeRange(
        override.start_time,
        override.end_time,
        input.start_time,
        input.end_time
      );
    })
    .sort((left, right) => {
      const leftSpecificity = left.days_of_week.length > 0 ? 0 : 1;
      const rightSpecificity = right.days_of_week.length > 0 ? 0 : 1;
      if (leftSpecificity !== rightSpecificity) {
        return leftSpecificity - rightSpecificity;
      }

      const leftDuration = timeToMinutes(left.end_time) - timeToMinutes(left.start_time);
      const rightDuration = timeToMinutes(right.end_time) - timeToMinutes(right.start_time);
      if (leftDuration !== rightDuration) {
        return leftDuration - rightDuration;
      }

      return left.start_time.localeCompare(right.start_time);
    })[0];

  if (matchingOverride) {
    return matchingOverride.room_ids;
  }

  return settings.defaults.find((item) => item.room_type === input.room_type)?.room_ids ?? [];
};

export const buildEmptyRoomPrioritySettings = (): RoomPrioritySettingsPayload => ({
  ...DEFAULT_SETTINGS
});
