import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

export const DEFAULT_HOMEROOM_START_TIME = '08:00';
export const DEFAULT_HOMEROOM_END_TIME = '14:40';
export const HOMEROOM_DEFAULT_SETTINGS_KEY = 'homeroom_default_schedule';
export const SCHOOL_DAYS = [0, 1, 2, 3, 4, 5] as const;

export interface HomeroomDaySchedule {
  day_of_week: number;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
}

export interface HomeroomDefaultSettingRow {
  id: string;
  homeroom_id: number | null;
  grade_id: string | null;
  effective_from: string;
  weekly_schedule: HomeroomDaySchedule[];
  start_time?: string;
  end_time?: string;
  updated_at?: string;
  updated_by?: string | null;
}

interface HomeroomDefaultsPayload {
  gradeDefaults?: HomeroomDefaultSettingRow[];
  homeroomOverrides?: HomeroomDefaultSettingRow[];
}

interface HomeroomRow {
  id: number;
  grade_id: string | null;
  room_id?: string;
}

interface ResolveHoursParams {
  homeroomId: number;
  gradeId: string | null;
  date: string;
  settings: HomeroomDefaultSettingRow[];
}

export const formatDateOnly = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const getDayOfWeek = (date: string): number => new Date(`${date}T00:00:00`).getDay();

export const isTimeRangeValid = (startTime: string, endTime: string): boolean => startTime < endTime;

export const buildUniformWeeklySchedule = (
  startTime: string = DEFAULT_HOMEROOM_START_TIME,
  endTime: string = DEFAULT_HOMEROOM_END_TIME
): HomeroomDaySchedule[] => SCHOOL_DAYS.map((day) => ({
  day_of_week: day,
  is_active: true,
  start_time: startTime,
  end_time: endTime
}));

export const normalizeWeeklySchedule = (weeklySchedule: unknown): HomeroomDaySchedule[] => {
  if (!Array.isArray(weeklySchedule)) {
    return [];
  }

  const normalized = weeklySchedule
    .map((slot) => {
      if (!slot || typeof slot !== 'object') {
        return null;
      }

      const rawDay = Number((slot as any).day_of_week);
      const isActive = (slot as any).is_active !== false;
      const rawStart = typeof (slot as any).start_time === 'string' ? (slot as any).start_time : null;
      const rawEnd = typeof (slot as any).end_time === 'string' ? (slot as any).end_time : null;

      if (!Number.isInteger(rawDay) || rawDay < 0 || rawDay > 6) {
        return null;
      }

      if (!isActive) {
        return {
          day_of_week: rawDay,
          is_active: false,
          start_time: null,
          end_time: null
        };
      }

      if (!rawStart || !rawEnd || !isTimeRangeValid(rawStart, rawEnd)) {
        return null;
      }

      return {
        day_of_week: rawDay,
        is_active: true,
        start_time: rawStart,
        end_time: rawEnd
      };
    })
    .filter((slot): slot is HomeroomDaySchedule => slot !== null);

  const byDay = new Map<number, HomeroomDaySchedule>();
  normalized.forEach((slot) => {
    byDay.set(slot.day_of_week, slot);
  });

  return SCHOOL_DAYS.map((day) => byDay.get(day) ?? {
    day_of_week: day,
    is_active: true,
    start_time: DEFAULT_HOMEROOM_START_TIME,
    end_time: DEFAULT_HOMEROOM_END_TIME
  });
};

export const normalizeSettingRow = (raw: Partial<HomeroomDefaultSettingRow>): HomeroomDefaultSettingRow | null => {
  if (!raw.effective_from) {
    return null;
  }

  const weeklySchedule = normalizeWeeklySchedule(raw.weekly_schedule);
  const fallbackSchedule = weeklySchedule.length > 0
    ? weeklySchedule
    : (raw.start_time && raw.end_time && isTimeRangeValid(raw.start_time, raw.end_time)
        ? buildUniformWeeklySchedule(raw.start_time, raw.end_time)
        : buildUniformWeeklySchedule());

  return {
    id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : randomUUID(),
    homeroom_id: typeof raw.homeroom_id === 'number' ? raw.homeroom_id : null,
    grade_id: typeof raw.grade_id === 'string' && raw.grade_id.trim() !== '' ? raw.grade_id : null,
    effective_from: raw.effective_from,
    weekly_schedule: fallbackSchedule,
    start_time: fallbackSchedule.find((slot) => slot.is_active)?.start_time ?? undefined,
    end_time: fallbackSchedule.find((slot) => slot.is_active)?.end_time ?? undefined,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : null
  };
};

const sortSettings = (settings: HomeroomDefaultSettingRow[]) =>
  [...settings].sort((a, b) => {
    if (a.effective_from !== b.effective_from) {
      return b.effective_from.localeCompare(a.effective_from);
    }

    return b.id.localeCompare(a.id);
  });

export const loadHomeroomDefaultSchedule = async (
  trx: Knex | Knex.Transaction
): Promise<{
  gradeDefaults: HomeroomDefaultSettingRow[];
  homeroomOverrides: HomeroomDefaultSettingRow[];
}> => {
  const row = await trx('settings')
    .select('value')
    .where({ key: HOMEROOM_DEFAULT_SETTINGS_KEY })
    .first();

  const payload = (row?.value ?? {}) as HomeroomDefaultsPayload;
  const gradeDefaults = Array.isArray(payload.gradeDefaults)
    ? sortSettings(payload.gradeDefaults.map(normalizeSettingRow).filter((item): item is HomeroomDefaultSettingRow => item !== null))
    : [];
  const homeroomOverrides = Array.isArray(payload.homeroomOverrides)
    ? sortSettings(payload.homeroomOverrides.map(normalizeSettingRow).filter((item): item is HomeroomDefaultSettingRow => item !== null))
    : [];

  return { gradeDefaults, homeroomOverrides };
};

export const saveHomeroomDefaultSchedule = async (
  trx: Knex | Knex.Transaction,
  payload: {
    gradeDefaults: HomeroomDefaultSettingRow[];
    homeroomOverrides: HomeroomDefaultSettingRow[];
  }
) => {
  const value = {
    gradeDefaults: sortSettings(payload.gradeDefaults),
    homeroomOverrides: sortSettings(payload.homeroomOverrides)
  };

  const existing = await trx('settings')
    .select('id')
    .where({ key: HOMEROOM_DEFAULT_SETTINGS_KEY })
    .first();

  if (existing) {
    await trx('settings')
      .where({ key: HOMEROOM_DEFAULT_SETTINGS_KEY })
      .update({
        value: JSON.stringify(value),
        updatedAt: trx.fn.now()
      });
    return;
  }

  await trx('settings').insert({
    id: randomUUID(),
    key: HOMEROOM_DEFAULT_SETTINGS_KEY,
    value: JSON.stringify(value),
    createdAt: trx.fn.now(),
    updatedAt: trx.fn.now()
  });
};

export const fetchHomeroomDefaultSettings = async (
  trx: Knex | Knex.Transaction,
  options: {
    homeroomIds?: number[];
    gradeIds?: string[];
  } = {}
): Promise<HomeroomDefaultSettingRow[]> => {
  const { homeroomIds = [], gradeIds = [] } = options;
  const { gradeDefaults, homeroomOverrides } = await loadHomeroomDefaultSchedule(trx);

  return sortSettings([
    ...homeroomOverrides.filter((setting) => homeroomIds.length === 0 || homeroomIds.includes(setting.homeroom_id ?? -1)),
    ...gradeDefaults.filter((setting) => gradeIds.length === 0 || (setting.grade_id !== null && gradeIds.includes(setting.grade_id)))
  ]);
};

export const appendGradeDefaultSetting = async (
  trx: Knex | Knex.Transaction,
  input: {
    grade_id: string;
    effective_from: string;
    weekly_schedule: HomeroomDaySchedule[];
    updated_by?: string | null;
  }
) => {
  const schedule = await loadHomeroomDefaultSchedule(trx);
  schedule.gradeDefaults.push({
    id: randomUUID(),
    homeroom_id: null,
    grade_id: input.grade_id,
    effective_from: input.effective_from,
    weekly_schedule: normalizeWeeklySchedule(input.weekly_schedule),
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by ?? null
  });
  await saveHomeroomDefaultSchedule(trx, schedule);
  return schedule;
};

export const appendHomeroomOverrideSetting = async (
  trx: Knex | Knex.Transaction,
  input: {
    homeroom_id: number;
    grade_id: string | null;
    effective_from: string;
    weekly_schedule: HomeroomDaySchedule[];
    updated_by?: string | null;
  }
) => {
  const schedule = await loadHomeroomDefaultSchedule(trx);
  schedule.homeroomOverrides.push({
    id: randomUUID(),
    homeroom_id: input.homeroom_id,
    grade_id: input.grade_id,
    effective_from: input.effective_from,
    weekly_schedule: normalizeWeeklySchedule(input.weekly_schedule),
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by ?? null
  });
  await saveHomeroomDefaultSchedule(trx, schedule);
  return schedule;
};

const resolveScheduleForDate = (setting: HomeroomDefaultSettingRow | undefined, date: string): HomeroomDaySchedule | null => {
  if (!setting) {
    return null;
  }

  const dayOfWeek = getDayOfWeek(date);
  return setting.weekly_schedule.find((slot) => slot.day_of_week === dayOfWeek) ?? null;
};

export const resolveHomeroomDefaultHours = ({
  homeroomId,
  gradeId,
  date,
  settings
}: ResolveHoursParams) => {
  const homeroomOverride = settings.find(
    (setting) =>
      setting.homeroom_id === homeroomId &&
      setting.effective_from <= date
  );
  const homeroomSlot = resolveScheduleForDate(homeroomOverride, date);

  if (homeroomSlot) {
    return {
      start_time: homeroomSlot.start_time,
      end_time: homeroomSlot.end_time,
      is_active: homeroomSlot.is_active,
      source: 'homeroom' as const,
      setting_id: homeroomOverride?.id ?? null
    };
  }

  const gradeDefault = settings.find(
    (setting) =>
      setting.homeroom_id === null &&
      setting.grade_id === gradeId &&
      setting.effective_from <= date
  );
  const gradeSlot = resolveScheduleForDate(gradeDefault, date);

  if (gradeSlot) {
    return {
      start_time: gradeSlot.start_time,
      end_time: gradeSlot.end_time,
      is_active: gradeSlot.is_active,
      source: 'grade' as const,
      setting_id: gradeDefault?.id ?? null
    };
  }

  const defaultSlot = buildUniformWeeklySchedule().find((slot) => slot.day_of_week === getDayOfWeek(date))!;
  return {
    start_time: defaultSlot.start_time,
    end_time: defaultSlot.end_time,
    is_active: defaultSlot.is_active,
    source: 'system' as const,
    setting_id: null
  };
};

function getSchoolYearEndForDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  const year = parsed.getMonth() >= 8 ? parsed.getFullYear() + 1 : parsed.getFullYear();
  return `${year}-06-30`;
}

export const applyHomeroomDefaultSettingsToAssignments = async (
  trx: Knex.Transaction,
  homeroomIds: number[],
  startDate: string,
  createdBy: string
) => {
  if (homeroomIds.length === 0) {
    return;
  }

  const homerooms = await trx('homerooms')
    .select<HomeroomRow[]>('id', 'grade_id', 'room_id')
    .whereIn('id', homeroomIds)
    .andWhere({ is_active: true });

  if (homerooms.length === 0) {
    return;
  }

  const gradeIds = homerooms
    .map((homeroom) => homeroom.grade_id)
    .filter((gradeId): gradeId is string => typeof gradeId === 'string' && gradeId.length > 0);

  const settings = await fetchHomeroomDefaultSettings(trx, {
    homeroomIds,
    gradeIds
  });

  const homeroomMap = new Map(homerooms.map((homeroom) => [String(homeroom.id), homeroom]));
  const existingAssignments = await trx('assignments')
    .select('id', 'assignable_id', 'date')
    .where('assignable_type', 'homeroom')
    .whereIn('assignable_id', homeroomIds.map(String))
    .where('status', 'active')
    .where('is_manual', false)
    .whereRaw('DATE(date) >= DATE(?)', [startDate]);

  const existingByKey = new Map(
    existingAssignments.map((assignment) => [`${assignment.assignable_id}:${formatDateOnly(assignment.date as string)}`, assignment])
  );

  const endDate = getSchoolYearEndForDate(startDate);

  for (const homeroom of homerooms) {
    for (let cursor = new Date(`${startDate}T00:00:00`); formatDateOnly(cursor) <= endDate; cursor.setDate(cursor.getDate() + 1)) {
      const date = formatDateOnly(cursor);
      if (getDayOfWeek(date) === 6) {
        continue;
      }

      const key = `${homeroom.id}:${date}`;
      const existing = existingByKey.get(key);
      const resolvedHours = resolveHomeroomDefaultHours({
        homeroomId: homeroom.id,
        gradeId: homeroom.grade_id,
        date,
        settings
      });

      if (!resolvedHours.is_active) {
        if (existing) {
          await trx('assignments').where({ id: existing.id }).delete();
        }
        continue;
      }

      const payload = {
        start_time: resolvedHours.start_time,
        end_time: resolvedHours.end_time,
        time_slots: JSON.stringify([{ start: resolvedHours.start_time, end: resolvedHours.end_time }]),
        updated_at: trx.fn.now()
      };

      if (existing) {
        await trx('assignments').where({ id: existing.id }).update(payload);
        continue;
      }

      await trx('assignments').insert({
        type: 'one_time',
        assignable_type: 'homeroom',
        assignable_id: homeroom.id,
        room_id: homeroom.room_id,
        activity_type: 'לימודים',
        created_by: createdBy,
        start_date: date,
        date,
        start_time: resolvedHours.start_time,
        end_time: resolvedHours.end_time,
        days_of_week: JSON.stringify([getDayOfWeek(date)]),
        time_slots: JSON.stringify([{ start: resolvedHours.start_time, end: resolvedHours.end_time }]),
        is_manual: false,
        status: 'active',
        created_at: trx.fn.now(),
        updated_at: trx.fn.now()
      });
    }
  }
};
