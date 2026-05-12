import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';
import { formatAcademicYearDate, getActiveAcademicYear } from './academicYears';

export const MUSIC_ROOM_DEFAULT_SETTINGS_KEY = 'music_room_default_schedule';
export const MUSIC_ROOM_BLOCK_ASSIGNABLE_TYPE = 'room_block';
export const MUSIC_ROOM_BLOCK_ACTIVITY_TYPE = 'music_room_block';
export const MUSIC_ROOM_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5] as const;
export const MUSIC_ROOM_BLOCK_TITLE = 'חדר מוזיקה תפוס';
const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

export interface MusicRoomDaySchedule {
  day_of_week: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface MusicRoomDefaultSettingRow {
  id: string;
  room_id: string;
  effective_from: string;
  weekly_schedule: MusicRoomDaySchedule[];
  updated_at?: string;
  updated_by?: string | null;
}

interface MusicRoomDefaultsPayload {
  roomOverrides?: MusicRoomDefaultSettingRow[];
}

const formatDateOnly = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getTodayDateOnly = () => formatDateOnly(new Date());
const getDayOfWeek = (date: string): number => new Date(`${date}T00:00:00`).getDay();
const isTimeRangeValid = (startTime: string, endTime: string): boolean => startTime < endTime;

export const buildMusicRoomWeeklySchedule = (): MusicRoomDaySchedule[] =>
  MUSIC_ROOM_SCHEDULE_DAYS.map((day) => ({
    day_of_week: day,
    is_active: false,
    start_time: null,
    end_time: null
  }));

export const normalizeMusicRoomWeeklySchedule = (weeklySchedule: unknown): MusicRoomDaySchedule[] => {
  if (!Array.isArray(weeklySchedule)) {
    return buildMusicRoomWeeklySchedule();
  }

  const normalized = weeklySchedule
    .map((slot) => {
      if (!slot || typeof slot !== 'object') {
        return null;
      }

      const rawDay = Number((slot as any).day_of_week);
      if (!Number.isInteger(rawDay) || rawDay < 0 || rawDay > 6 || rawDay === 6) {
        return null;
      }

      const isActive = (slot as any).is_active === true;
      const startTime = typeof (slot as any).start_time === 'string' ? (slot as any).start_time : null;
      const endTime = typeof (slot as any).end_time === 'string' ? (slot as any).end_time : null;

      if (!isActive) {
        return {
          day_of_week: rawDay,
          is_active: false,
          start_time: null,
          end_time: null
        };
      }

      if (!startTime || !endTime || !isTimeRangeValid(startTime, endTime)) {
        return null;
      }

      return {
        day_of_week: rawDay,
        is_active: true,
        start_time: startTime,
        end_time: endTime
      };
    })
    .filter((slot): slot is MusicRoomDaySchedule => slot !== null);

  const byDay = new Map<number, MusicRoomDaySchedule>();
  normalized.forEach((slot) => {
    byDay.set(slot.day_of_week, slot);
  });

  return buildMusicRoomWeeklySchedule().map((slot) => byDay.get(slot.day_of_week) ?? slot);
};

const normalizeSettingRow = (raw: Partial<MusicRoomDefaultSettingRow>): MusicRoomDefaultSettingRow | null => {
  if (!raw.effective_from || typeof raw.room_id !== 'string' || raw.room_id.trim() === '') {
    return null;
  }

  return {
    id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : randomUUID(),
    room_id: raw.room_id.trim(),
    effective_from: raw.effective_from,
    weekly_schedule: normalizeMusicRoomWeeklySchedule(raw.weekly_schedule),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : null
  };
};

const sortSettings = (settings: MusicRoomDefaultSettingRow[]) =>
  [...settings].sort((a, b) => {
    if (a.effective_from !== b.effective_from) {
      return b.effective_from.localeCompare(a.effective_from);
    }

    const updatedAtCompare = String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? ''));
    if (updatedAtCompare !== 0) {
      return updatedAtCompare;
    }

    return b.id.localeCompare(a.id);
  });

const replaceRoomOverrideForEffectiveDate = (
  overrides: MusicRoomDefaultSettingRow[],
  input: {
    room_id: string;
    effective_from: string;
    weekly_schedule: MusicRoomDaySchedule[];
    updated_by?: string | null;
  }
) => {
  const nextOverrides = overrides.filter(
    (setting) => !(setting.room_id === input.room_id && setting.effective_from === input.effective_from)
  );

  nextOverrides.push({
    id: randomUUID(),
    room_id: input.room_id,
    effective_from: input.effective_from,
    weekly_schedule: normalizeMusicRoomWeeklySchedule(input.weekly_schedule),
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by ?? null
  });

  return nextOverrides;
};

export const loadMusicRoomDefaultSchedule = async (
  trx: Knex | Knex.Transaction
): Promise<{ roomOverrides: MusicRoomDefaultSettingRow[] }> => {
  const row = await trx('settings')
    .select('value')
    .where({ key: MUSIC_ROOM_DEFAULT_SETTINGS_KEY })
    .first();

  const payload = (row?.value ?? {}) as MusicRoomDefaultsPayload;
  const roomOverrides = Array.isArray(payload.roomOverrides)
    ? sortSettings(
        payload.roomOverrides
          .map(normalizeSettingRow)
          .filter((item): item is MusicRoomDefaultSettingRow => item !== null)
      )
    : [];

  return { roomOverrides };
};

export const saveMusicRoomDefaultSchedule = async (
  trx: Knex | Knex.Transaction,
  payload: { roomOverrides: MusicRoomDefaultSettingRow[] }
) => {
  const value = {
    roomOverrides: sortSettings(payload.roomOverrides)
  };

  const existing = await trx('settings')
    .select('id')
    .where({ key: MUSIC_ROOM_DEFAULT_SETTINGS_KEY })
    .first();

  if (existing) {
    await trx('settings')
      .where({ key: MUSIC_ROOM_DEFAULT_SETTINGS_KEY })
      .update({
        value: JSON.stringify(value),
        updatedAt: trx.fn.now()
      });
    return;
  }

  await trx('settings').insert({
    id: randomUUID(),
    key: MUSIC_ROOM_DEFAULT_SETTINGS_KEY,
    value: JSON.stringify(value),
    createdAt: trx.fn.now(),
    updatedAt: trx.fn.now()
  });
};

export const saveMusicRoomOverrideSetting = async (
  trx: Knex | Knex.Transaction,
  input: {
    room_id: string;
    effective_from: string;
    weekly_schedule: MusicRoomDaySchedule[];
    updated_by?: string | null;
  }
) => {
  const schedule = await loadMusicRoomDefaultSchedule(trx);
  schedule.roomOverrides = replaceRoomOverrideForEffectiveDate(schedule.roomOverrides, input);
  await saveMusicRoomDefaultSchedule(trx, schedule);
  return schedule;
};

export const fetchMusicRoomDefaultSettings = async (
  trx: Knex | Knex.Transaction,
  roomIds: string[] = []
): Promise<MusicRoomDefaultSettingRow[]> => {
  const { roomOverrides } = await loadMusicRoomDefaultSchedule(trx);
  return sortSettings(
    roomOverrides.filter((setting) => roomIds.length === 0 || roomIds.includes(setting.room_id))
  );
};

export const resolveMusicRoomWeeklyScheduleForDate = ({
  roomId,
  effectiveFrom,
  settings
}: {
  roomId: string;
  effectiveFrom: string;
  settings: MusicRoomDefaultSettingRow[];
}): MusicRoomDaySchedule[] => {
  const roomOverride = settings.find(
    (setting) => setting.room_id === roomId && setting.effective_from <= effectiveFrom
  );

  return normalizeMusicRoomWeeklySchedule(roomOverride?.weekly_schedule ?? buildMusicRoomWeeklySchedule());
};

const resolveScheduleForDate = (
  setting: MusicRoomDefaultSettingRow | undefined,
  date: string
): MusicRoomDaySchedule | null => {
  if (!setting) {
    return null;
  }

  return setting.weekly_schedule.find((slot) => slot.day_of_week === getDayOfWeek(date)) ?? null;
};

export const resolveMusicRoomDefaultBlock = ({
  roomId,
  date,
  settings
}: {
  roomId: string;
  date: string;
  settings: MusicRoomDefaultSettingRow[];
}) => {
  const roomOverride = settings.find(
    (setting) => setting.room_id === roomId && setting.effective_from <= date
  );
  const roomSlot = resolveScheduleForDate(roomOverride, date);

  if (roomSlot) {
    return {
      ...roomSlot,
      source: 'room' as const,
      setting_id: roomOverride?.id ?? null
    };
  }

  const defaultSlot = buildMusicRoomWeeklySchedule().find((slot) => slot.day_of_week === getDayOfWeek(date))!;
  return {
    ...defaultSlot,
    source: 'system' as const,
    setting_id: null
  };
};

const isMusicRoom = (room: { room_type?: string | null; notes?: string | null }) => {
  const roomType = String(room.room_type || '').trim().toUpperCase();
  const notes = String(room.notes || '').trim().toLowerCase();
  return roomType === 'MUSIC' || roomType === 'MUSIC_ROOM' || notes.includes('מוזיקה');
};

const buildMusicRoomTimeSlots = (startTime: string, endTime: string, sourceSettingId?: string | null) =>
  JSON.stringify([{
    start: startTime,
    end: endTime,
    title: MUSIC_ROOM_BLOCK_TITLE,
    ...(sourceSettingId ? { source_setting_id: sourceSettingId } : {})
  }]);

const isUuid = (value: unknown): boolean =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toActorUuid = (value: unknown, fallback?: unknown): string => {
  if (isUuid(value)) {
    return value as string;
  }

  const source = String(value || fallback || '').trim();
  return uuidv5(source || 'system-user', USER_ID_NAMESPACE);
};

const resolveActiveUserId = async (trx: Knex | Knex.Transaction): Promise<string | null> => {
  const user = await trx('users')
    .select('id')
    .where({ is_active: true })
    .orderBy('created_at', 'asc')
    .first();

  return user?.id ? toActorUuid(user.id) : null;
};

const getCreatedBy = async (trx: Knex | Knex.Transaction, createdBy?: string | null) => {
  if (createdBy && createdBy.trim() !== '') {
    return toActorUuid(createdBy);
  }

  return resolveActiveUserId(trx);
};

export const applyMusicRoomDefaultSettingsToAssignments = async (
  trx: Knex.Transaction,
  roomIds: string[],
  startDate: string,
  createdBy?: string | null
) => {
  if (roomIds.length === 0) {
    return;
  }

  const normalizedRoomIds = roomIds.map(String);
  const rooms = await trx('rooms')
    .select('id', 'room_number', 'room_type', 'notes')
    .whereIn('id', normalizedRoomIds)
    .andWhere({ is_active: true });

  const musicRooms = rooms.filter((room: any) => isMusicRoom(room));
  if (musicRooms.length === 0) {
    return;
  }

  const actorId = await getCreatedBy(trx, createdBy);
  if (!actorId) {
    return;
  }

  const syncStartDate = startDate > getTodayDateOnly() ? startDate : getTodayDateOnly();
  const settings = await fetchMusicRoomDefaultSettings(trx, musicRooms.map((room: any) => String(room.id)));
  const existingAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'start_time', 'end_time', 'assignable_type', 'assignable_id', 'is_manual')
    .whereIn('room_id', musicRooms.map((room: any) => String(room.id)))
    .where('assignable_type', MUSIC_ROOM_BLOCK_ASSIGNABLE_TYPE)
    .where('status', 'active')
    .where('is_manual', false)
    .whereRaw('DATE(date) >= DATE(?)', [syncStartDate]);
  const occupiedAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'start_time', 'end_time', 'assignable_type', 'assignable_id', 'is_manual')
    .whereIn('room_id', musicRooms.map((room: any) => String(room.id)))
    .where('status', 'active')
    .whereRaw('DATE(date) >= DATE(?)', [syncStartDate]);

  const existingByRoomAndDate = new Map(
    existingAssignments.map((assignment: any) => [
      `${String(assignment.room_id)}|${formatDateOnly(assignment.date)}`,
      assignment
    ])
  );
  const occupiedBySlot = new Map(
    occupiedAssignments.map((assignment: any) => [
      `${String(assignment.room_id)}|${formatDateOnly(assignment.date)}|${assignment.start_time}|${assignment.end_time}`,
      assignment
    ])
  );
  const retainedIds = new Set<string>();

  const activeAcademicYear = await getActiveAcademicYear(trx);
  const endDate = formatAcademicYearDate(activeAcademicYear?.end_date);
  if (!endDate || syncStartDate > endDate) {
    return;
  }

  for (const room of musicRooms) {
    const roomId = String((room as any).id);

    for (let cursor = new Date(`${syncStartDate}T00:00:00`); formatDateOnly(cursor) <= endDate; cursor.setDate(cursor.getDate() + 1)) {
      const date = formatDateOnly(cursor);
      if (getDayOfWeek(date) === 6) {
        continue;
      }

      const resolvedBlock = resolveMusicRoomDefaultBlock({
        roomId,
        date,
        settings
      });
      const existing = existingByRoomAndDate.get(`${roomId}|${date}`);

      if (!resolvedBlock.is_active || !resolvedBlock.start_time || !resolvedBlock.end_time) {
        if (existing) {
          await trx('assignments').where({ id: existing.id }).delete();
        }
        continue;
      }

      const slotKey = `${roomId}|${date}|${resolvedBlock.start_time}|${resolvedBlock.end_time}`;
      const occupied = occupiedBySlot.get(slotKey);

      if (existing) {
        const occupiedByOtherAssignment =
          occupied &&
          String((occupied as any).id) !== String((existing as any).id);

        if (occupiedByOtherAssignment) {
          continue;
        }

        await trx('assignments')
          .where({ id: existing.id })
          .update({
            assignable_id: roomId,
            start_date: date,
            date,
            specific_date: date,
            end_date: date,
            start_time: resolvedBlock.start_time,
            end_time: resolvedBlock.end_time,
            time_slots: buildMusicRoomTimeSlots(resolvedBlock.start_time, resolvedBlock.end_time, resolvedBlock.setting_id),
            updated_at: trx.fn.now()
          });

        retainedIds.add(String(existing.id));
        continue;
      }

      if (occupied) {
        continue;
      }

      const [created] = await trx('assignments')
        .insert({
          type: 'one_time',
          assignable_type: MUSIC_ROOM_BLOCK_ASSIGNABLE_TYPE,
          assignable_id: roomId,
          room_id: roomId,
          activity_type: MUSIC_ROOM_BLOCK_ACTIVITY_TYPE,
          created_by: actorId,
          start_date: date,
          date,
          specific_date: date,
          end_date: date,
          start_time: resolvedBlock.start_time,
          end_time: resolvedBlock.end_time,
          days_of_week: JSON.stringify([getDayOfWeek(date)]),
          time_slots: buildMusicRoomTimeSlots(resolvedBlock.start_time, resolvedBlock.end_time, resolvedBlock.setting_id),
          is_manual: false,
          status: 'active',
          created_at: trx.fn.now(),
          updated_at: trx.fn.now()
        })
        .returning('id');

      if (created?.id) {
        retainedIds.add(String(created.id));
      }
    }
  }

  const obsoleteAssignmentIds = existingAssignments
    .filter((assignment: any) => !retainedIds.has(String(assignment.id)))
    .map((assignment: any) => assignment.id);

  if (obsoleteAssignmentIds.length > 0) {
    await trx('assignments')
      .whereIn('id', obsoleteAssignmentIds)
      .delete();
  }
};

export const syncMusicRoomDefaults = async (
  trx: Knex | Knex.Transaction,
  startDate: string,
  createdBy?: string | null
) => {
  const rooms = await trx('rooms')
    .select('id', 'room_type', 'notes')
    .where({ is_active: true });

  const musicRoomIds = rooms
    .filter((room: any) => isMusicRoom(room))
    .map((room: any) => String(room.id));

  if (musicRoomIds.length === 0) {
    return;
  }

  await applyMusicRoomDefaultSettingsToAssignments(
    trx as Knex.Transaction,
    musicRoomIds,
    startDate,
    createdBy
  );
};
