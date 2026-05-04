import type { Knex } from 'knex';
import { randomUUID } from 'crypto';
import { v5 as uuidv5 } from 'uuid';

export const DEFAULT_AUDITORIUM_START_TIME = '17:00';
export const DEFAULT_AUDITORIUM_END_TIME = '22:00';
export const DEFAULT_AUDITORIUM_TITLE = "שנה ג'";
export const AUDITORIUM_DEFAULT_SETTINGS_KEY = 'auditorium_default_schedule';
export const AUDITORIUM_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5] as const;
const USER_ID_NAMESPACE = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';
const AUDITORIUM_SYNC_LOCK_KEY = 48123017;

export interface AuditoriumScheduleEntry {
  id?: string;
  start_time: string;
  end_time: string;
  title: string;
  note?: string | null;
}

export interface AuditoriumDaySchedule {
  day_of_week: number;
  is_active: boolean;
  entries: AuditoriumScheduleEntry[];
}

export interface AuditoriumDefaultSettingRow {
  id: string;
  room_id: string | null;
  effective_from: string;
  weekly_schedule: AuditoriumDaySchedule[];
  updated_at?: string;
  updated_by?: string | null;
}

interface AuditoriumSelectedChange {
  day_of_week: number;
  entry_id: string;
}

interface AuditoriumDefaultsPayload {
  roomOverrides?: AuditoriumDefaultSettingRow[];
}

const formatDateOnly = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const getTodayDateOnly = (): string => formatDateOnly(new Date());

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

const getDayOfWeek = (date: string): number => new Date(`${date}T00:00:00`).getDay();

const isTimeRangeValid = (startTime: string, endTime: string): boolean => startTime < endTime;

const normalizeEntry = (entry: unknown): AuditoriumScheduleEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const startTime = typeof (entry as any).start_time === 'string' ? (entry as any).start_time : '';
  const endTime = typeof (entry as any).end_time === 'string' ? (entry as any).end_time : '';
  const title = typeof (entry as any).title === 'string' ? (entry as any).title.trim() : '';
  const note = typeof (entry as any).note === 'string' ? (entry as any).note.trim() : '';

  if (!startTime || !endTime || !isTimeRangeValid(startTime, endTime) || !title) {
    return null;
  }

  return {
    id: typeof (entry as any).id === 'string' && (entry as any).id.trim() !== '' ? (entry as any).id : randomUUID(),
    start_time: startTime,
    end_time: endTime,
    title,
    note: note || null
  };
};

export const buildAuditoriumWeeklySchedule = (): AuditoriumDaySchedule[] =>
  AUDITORIUM_SCHEDULE_DAYS.map((day) => ({
    day_of_week: day,
    is_active: day === 0,
    entries: day === 0
      ? [{
          id: randomUUID(),
          start_time: DEFAULT_AUDITORIUM_START_TIME,
          end_time: DEFAULT_AUDITORIUM_END_TIME,
          title: DEFAULT_AUDITORIUM_TITLE,
          note: null
        }]
      : []
  }));

export const normalizeAuditoriumWeeklySchedule = (weeklySchedule: unknown): AuditoriumDaySchedule[] => {
  if (!Array.isArray(weeklySchedule)) {
    return buildAuditoriumWeeklySchedule();
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

      const entries = Array.isArray((slot as any).entries)
        ? (slot as any).entries.map(normalizeEntry).filter((item: AuditoriumScheduleEntry | null): item is AuditoriumScheduleEntry => item !== null)
        : (() => {
            const legacyStart = typeof (slot as any).start_time === 'string' ? (slot as any).start_time : null;
            const legacyEnd = typeof (slot as any).end_time === 'string' ? (slot as any).end_time : null;
            const legacyActive = (slot as any).is_active === true;
            if (legacyActive && legacyStart && legacyEnd && isTimeRangeValid(legacyStart, legacyEnd)) {
              return [{
                id: randomUUID(),
                start_time: legacyStart,
                end_time: legacyEnd,
                title: DEFAULT_AUDITORIUM_TITLE,
                note: null
              }];
            }
            return [];
          })();

      return {
        day_of_week: rawDay,
        is_active: entries.length > 0,
        entries: [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time))
      };
    })
    .filter((slot): slot is AuditoriumDaySchedule => slot !== null);

  const byDay = new Map<number, AuditoriumDaySchedule>();
  normalized.forEach((slot) => {
    byDay.set(slot.day_of_week, slot);
  });

  return buildAuditoriumWeeklySchedule().map((slot) => byDay.get(slot.day_of_week) ?? slot);
};

const normalizeSettingRow = (raw: Partial<AuditoriumDefaultSettingRow>): AuditoriumDefaultSettingRow | null => {
  if (!raw.effective_from) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' && raw.id.trim() !== '' ? raw.id : randomUUID(),
    room_id: typeof raw.room_id === 'string' && raw.room_id.trim() !== '' ? raw.room_id : null,
    effective_from: raw.effective_from,
    weekly_schedule: normalizeAuditoriumWeeklySchedule(raw.weekly_schedule),
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : undefined,
    updated_by: typeof raw.updated_by === 'string' ? raw.updated_by : null
  };
};

const sortSettings = (settings: AuditoriumDefaultSettingRow[]) =>
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
  overrides: AuditoriumDefaultSettingRow[],
  input: {
    room_id: string;
    effective_from: string;
    weekly_schedule: AuditoriumDaySchedule[];
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
    weekly_schedule: normalizeAuditoriumWeeklySchedule(input.weekly_schedule),
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by ?? null
  });

  return nextOverrides;
};

export const loadAuditoriumDefaultSchedule = async (
  trx: Knex | Knex.Transaction
): Promise<{ roomOverrides: AuditoriumDefaultSettingRow[] }> => {
  const row = await trx('settings')
    .select('value')
    .where({ key: AUDITORIUM_DEFAULT_SETTINGS_KEY })
    .first();

  const payload = (row?.value ?? {}) as AuditoriumDefaultsPayload;
  const roomOverrides = Array.isArray(payload.roomOverrides)
    ? sortSettings(
        payload.roomOverrides
          .map(normalizeSettingRow)
          .filter((item): item is AuditoriumDefaultSettingRow => item !== null)
      )
    : [];

  return { roomOverrides };
};

export const saveAuditoriumDefaultSchedule = async (
  trx: Knex | Knex.Transaction,
  payload: { roomOverrides: AuditoriumDefaultSettingRow[] }
) => {
  const value = {
    roomOverrides: sortSettings(payload.roomOverrides)
  };

  const existing = await trx('settings')
    .select('id')
    .where({ key: AUDITORIUM_DEFAULT_SETTINGS_KEY })
    .first();

  if (existing) {
    await trx('settings')
      .where({ key: AUDITORIUM_DEFAULT_SETTINGS_KEY })
      .update({
        value: JSON.stringify(value),
        updatedAt: trx.fn.now()
      });
    return;
  }

  await trx('settings').insert({
    id: randomUUID(),
    key: AUDITORIUM_DEFAULT_SETTINGS_KEY,
    value: JSON.stringify(value),
    createdAt: trx.fn.now(),
    updatedAt: trx.fn.now()
  });
};

export const appendAuditoriumOverrideSetting = async (
  trx: Knex | Knex.Transaction,
  input: {
    room_id: string;
    effective_from: string;
    weekly_schedule: AuditoriumDaySchedule[];
    updated_by?: string | null;
  }
) => {
  const schedule = await loadAuditoriumDefaultSchedule(trx);
  schedule.roomOverrides = replaceRoomOverrideForEffectiveDate(schedule.roomOverrides, input);
  await saveAuditoriumDefaultSchedule(trx, schedule);
  return schedule;
};

export const saveAuditoriumOverrideSetting = async (
  trx: Knex | Knex.Transaction,
  input: {
    room_id: string;
    effective_from: string;
    weekly_schedule: AuditoriumDaySchedule[];
    updated_by?: string | null;
    selected_changes?: AuditoriumSelectedChange[];
  }
) => {
  const schedule = await loadAuditoriumDefaultSchedule(trx);
  const normalizedWeeklySchedule = normalizeAuditoriumWeeklySchedule(input.weekly_schedule);
  const selectedChanges = Array.isArray(input.selected_changes)
    ? input.selected_changes.filter(
        (change): change is AuditoriumSelectedChange =>
          !!change &&
          Number.isInteger(change.day_of_week) &&
          change.day_of_week >= 0 &&
          change.day_of_week <= 5 &&
          typeof change.entry_id === 'string' &&
          change.entry_id.trim() !== ''
      )
    : [];

  const exactRoomOverride =
    schedule.roomOverrides.find(
      (setting) => setting.room_id === input.room_id && setting.effective_from === input.effective_from
    ) ?? null;
  const baseWeeklySchedule =
    exactRoomOverride?.weekly_schedule ??
    resolveAuditoriumWeeklyScheduleForDate({
      roomId: input.room_id,
      effectiveFrom: input.effective_from,
      settings: schedule.roomOverrides
    });
  const incomingByDay = new Map(normalizedWeeklySchedule.map((slot) => [slot.day_of_week, slot]));
  const mergedByDay = new Map(
    buildAuditoriumWeeklySchedule().map((defaultSlot) => {
      const baseSlot = baseWeeklySchedule.find((slot) => slot.day_of_week === defaultSlot.day_of_week) ?? defaultSlot;
      return [
        defaultSlot.day_of_week,
        {
          day_of_week: baseSlot.day_of_week,
          is_active: baseSlot.entries.length > 0,
          entries: [...baseSlot.entries].sort((a, b) => a.start_time.localeCompare(b.start_time))
        } satisfies AuditoriumDaySchedule
      ];
    })
  );

  for (const change of selectedChanges) {
    const currentSlot = mergedByDay.get(change.day_of_week) ?? {
      day_of_week: change.day_of_week,
      is_active: false,
      entries: []
    };
    const incomingSlot = incomingByDay.get(change.day_of_week) ?? {
      day_of_week: change.day_of_week,
      is_active: false,
      entries: []
    };
    const incomingEntry = incomingSlot.entries.find((entry) => entry.id === change.entry_id) ?? null;
    const nextEntries = currentSlot.entries.filter((entry) => entry.id !== change.entry_id);

    if (incomingEntry) {
      nextEntries.push(incomingEntry);
      nextEntries.sort((a, b) => a.start_time.localeCompare(b.start_time));
    }

    mergedByDay.set(change.day_of_week, {
      day_of_week: change.day_of_week,
      is_active: nextEntries.length > 0,
      entries: nextEntries
    });
  }

  const mergedWeeklySchedule = buildAuditoriumWeeklySchedule().map(
    (defaultSlot) => mergedByDay.get(defaultSlot.day_of_week) ?? defaultSlot
  );

  schedule.roomOverrides = replaceRoomOverrideForEffectiveDate(schedule.roomOverrides, {
    room_id: input.room_id,
    effective_from: input.effective_from,
    weekly_schedule: mergedWeeklySchedule,
    updated_by: input.updated_by ?? null
  });

  await saveAuditoriumDefaultSchedule(trx, schedule);
  return schedule;
};

export const fetchAuditoriumDefaultSettings = async (
  trx: Knex | Knex.Transaction,
  roomIds: string[] = []
): Promise<AuditoriumDefaultSettingRow[]> => {
  const { roomOverrides } = await loadAuditoriumDefaultSchedule(trx);
  return sortSettings(
    roomOverrides.filter((setting) => roomIds.length === 0 || (setting.room_id !== null && roomIds.includes(setting.room_id)))
  );
};

export const resolveAuditoriumWeeklyScheduleForDate = ({
  roomId,
  effectiveFrom,
  settings
}: {
  roomId: string;
  effectiveFrom: string;
  settings: AuditoriumDefaultSettingRow[];
}): AuditoriumDaySchedule[] => {
  const roomOverride = settings.find(
    (setting) => setting.room_id === roomId && setting.effective_from <= effectiveFrom
  );

  return normalizeAuditoriumWeeklySchedule(roomOverride?.weekly_schedule ?? buildAuditoriumWeeklySchedule());
};

const resolveScheduleForDate = (setting: AuditoriumDefaultSettingRow | undefined, date: string): AuditoriumDaySchedule | null => {
  if (!setting) {
    return null;
  }

  return setting.weekly_schedule.find((slot) => slot.day_of_week === getDayOfWeek(date)) ?? null;
};

export const resolveAuditoriumDefaultEntries = ({
  roomId,
  date,
  settings
}: {
  roomId: string;
  date: string;
  settings: AuditoriumDefaultSettingRow[];
}) => {
  const roomOverride = settings.find(
    (setting) => setting.room_id === roomId && setting.effective_from <= date
  );
  const roomSlot = resolveScheduleForDate(roomOverride, date);

  if (roomSlot) {
    return {
      entries: roomSlot.entries,
      is_active: roomSlot.entries.length > 0,
      source: 'room' as const,
      setting_id: roomOverride?.id ?? null
    };
  }

  const defaultSlot = buildAuditoriumWeeklySchedule().find((slot) => slot.day_of_week === getDayOfWeek(date))!;
  return {
    entries: defaultSlot.entries,
    is_active: defaultSlot.entries.length > 0,
    source: 'system' as const,
    setting_id: null
  };
};

const getSchoolYearEndForDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00`);
  const year = parsed.getMonth() >= 8 ? parsed.getFullYear() + 1 : parsed.getFullYear();
  return `${year}-06-30`;
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

export const buildAuditoriumTimeSlots = (entry: {
  start_time: string;
  end_time: string;
  title?: string;
  note?: string | null;
  source_entry_id?: string | null;
  deleted?: boolean;
}) => JSON.stringify([{
  start: entry.start_time,
  end: entry.end_time,
  ...(entry.title ? { title: entry.title } : {}),
  ...(entry.note ? { note: entry.note } : {}),
  ...(entry.source_entry_id ? { source_entry_id: entry.source_entry_id } : {}),
  ...(entry.deleted ? { deleted: true } : {})
}]);

export const extractAuditoriumMetadata = (
  timeSlots: unknown
): { title?: string; note?: string | null; source_entry_id?: string; deleted?: boolean } => {
  const slots = Array.isArray(timeSlots)
    ? timeSlots
    : typeof timeSlots === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(timeSlots);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const first = slots[0];
  if (!first || typeof first !== 'object') {
    return {};
  }

  return {
    title: typeof (first as any).title === 'string' && (first as any).title.trim() !== '' ? (first as any).title.trim() : undefined,
    note: typeof (first as any).note === 'string' && (first as any).note.trim() !== '' ? (first as any).note.trim() : null,
    source_entry_id:
      typeof (first as any).source_entry_id === 'string' && (first as any).source_entry_id.trim() !== ''
        ? (first as any).source_entry_id.trim()
        : undefined,
    deleted: (first as any).deleted === true
  };
};

const buildDesiredAssignmentKey = (
  roomId: string,
  date: string,
  entry: AuditoriumScheduleEntry
) => `${roomId}|${date}|${entry.start_time}|${entry.end_time}|${entry.title}|${entry.note ?? ''}`;

const buildAssignmentSlotKey = (
  roomId: string,
  date: string,
  startTime: string,
  endTime: string
) => `${roomId}|${date}|${startTime}|${endTime}`;

const buildAuditoriumSourceKey = (
  roomId: string,
  date: string,
  sourceEntryId: string
) => `${roomId}|${date}|${sourceEntryId}`;

const buildExistingAssignmentKey = (assignment: {
  room_id: string;
  date: string | Date;
  start_time: string;
  end_time: string;
  time_slots: unknown;
}) => {
  const metadata = extractAuditoriumMetadata(assignment.time_slots);
  return `${String(assignment.room_id)}|${formatDateOnly(assignment.date)}|${assignment.start_time}|${assignment.end_time}|${metadata.title ?? ''}|${metadata.note ?? ''}`;
};

export const applyAuditoriumDefaultSettingsToAssignments = async (
  trx: Knex.Transaction,
  roomIds: string[],
  startDate: string,
  createdBy?: string | null
) => {
  if (roomIds.length === 0) {
    return;
  }

  await trx.raw('SELECT pg_advisory_xact_lock(?)', [AUDITORIUM_SYNC_LOCK_KEY]);

  const actorId = await getCreatedBy(trx, createdBy);
  if (!actorId) {
    return;
  }

  const rooms = await trx('rooms')
    .select('id', 'room_number', 'room_type')
    .whereIn('id', roomIds)
    .andWhere({ is_active: true })
    .whereRaw(`UPPER(CAST(room_type AS TEXT)) = 'AUDITORIUM'`);

  if (rooms.length === 0) {
    return;
  }

  const syncStartDate = startDate > getTodayDateOnly() ? startDate : getTodayDateOnly();
  const normalizedRoomIds = rooms.map((room: any) => String(room.id));
  const settings = await fetchAuditoriumDefaultSettings(trx, normalizedRoomIds);
  const allActiveAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'start_time', 'end_time', 'time_slots', 'assignable_type', 'assignable_id', 'is_manual')
    .whereIn('room_id', normalizedRoomIds)
    .where('status', 'active')
    .whereRaw('DATE(date) >= DATE(?)', [syncStartDate]);
  const existingAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'start_time', 'end_time', 'time_slots')
    .where('assignable_type', 'event')
    .whereIn('assignable_id', normalizedRoomIds)
    .where('status', 'active')
    .where('is_manual', false)
    .whereRaw('DATE(date) >= DATE(?)', [syncStartDate]);
  const manualOverrideAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'specific_date', 'time_slots')
    .whereIn('room_id', normalizedRoomIds)
    .where('assignable_type', 'event')
    .where('status', 'active')
    .where('is_manual', true)
    .whereRaw('DATE(COALESCE(specific_date, date)) >= DATE(?)', [syncStartDate]);
  const cancelledOverrideAssignments = await trx('assignments')
    .select('id', 'room_id', 'date', 'specific_date', 'time_slots')
    .whereIn('room_id', normalizedRoomIds)
    .where('assignable_type', 'event')
    .where('status', 'cancelled')
    .where('is_manual', true)
    .whereRaw('DATE(COALESCE(specific_date, date)) >= DATE(?)', [syncStartDate]);

  const existingByKey = new Map(
    existingAssignments.map((assignment: any) => [buildExistingAssignmentKey(assignment), assignment])
  );
  const managedBySlotKey = new Map(
    existingAssignments.map((assignment: any) => [
      buildAssignmentSlotKey(
        String(assignment.room_id),
        formatDateOnly(assignment.date),
        assignment.start_time,
        assignment.end_time
      ),
      assignment
    ])
  );
  const occupiedBySlotKey = new Map(
    allActiveAssignments.map((assignment: any) => [
      buildAssignmentSlotKey(
        String(assignment.room_id),
        formatDateOnly(assignment.date),
        assignment.start_time,
        assignment.end_time
      ),
      assignment
    ])
  );
  const manualOverrideSourceKeys = new Set(
    manualOverrideAssignments.flatMap((assignment: any) => {
      const metadata = extractAuditoriumMetadata(assignment.time_slots);
      const sourceEntryId = metadata.source_entry_id;
      const assignmentDate = formatDateOnly(assignment.specific_date ?? assignment.date);
      return sourceEntryId ? [buildAuditoriumSourceKey(String(assignment.room_id), assignmentDate, sourceEntryId)] : [];
    })
  );
  const cancelledOverrideSourceKeys = new Set(
    cancelledOverrideAssignments.flatMap((assignment: any) => {
      const metadata = extractAuditoriumMetadata(assignment.time_slots);
      const sourceEntryId = metadata.source_entry_id;
      const assignmentDate = formatDateOnly(assignment.specific_date ?? assignment.date);
      return sourceEntryId ? [buildAuditoriumSourceKey(String(assignment.room_id), assignmentDate, sourceEntryId)] : [];
    })
  );
  const desiredKeys = new Set<string>();
  const retainedManagedIds = new Set<string>();

  const endDate = getSchoolYearEndForDate(syncStartDate);

  for (const room of rooms) {
    const roomId = String(room.id);

    for (let cursor = new Date(`${syncStartDate}T00:00:00`); formatDateOnly(cursor) <= endDate; cursor.setDate(cursor.getDate() + 1)) {
      const date = formatDateOnly(cursor);
      if (getDayOfWeek(date) === 6) {
        continue;
      }

      const resolvedEntries = resolveAuditoriumDefaultEntries({
        roomId,
        date,
        settings
      });

      if (!resolvedEntries.is_active || resolvedEntries.entries.length === 0) {
        continue;
      }

      for (const entry of resolvedEntries.entries) {
        const sourceEntryId = entry.id ?? '';
        const sourceKey = sourceEntryId ? buildAuditoriumSourceKey(roomId, date, sourceEntryId) : null;
        if (sourceKey && (manualOverrideSourceKeys.has(sourceKey) || cancelledOverrideSourceKeys.has(sourceKey))) {
          continue;
        }

        const desiredKey = buildDesiredAssignmentKey(roomId, date, entry);
        desiredKeys.add(desiredKey);
        const slotKey = buildAssignmentSlotKey(roomId, date, entry.start_time, entry.end_time);

        const exactExisting = existingByKey.get(desiredKey);
        if (exactExisting) {
          retainedManagedIds.add(String(exactExisting.id));
          continue;
        }

        const managedExisting = managedBySlotKey.get(slotKey);

        if (managedExisting) {
          await trx('assignments')
            .where({ id: managedExisting.id })
            .update({
              time_slots: buildAuditoriumTimeSlots({
                start_time: entry.start_time,
                end_time: entry.end_time,
                title: entry.title,
                note: entry.note ?? null,
                source_entry_id: sourceEntryId || null
              }),
              updated_at: trx.fn.now()
            });
          retainedManagedIds.add(String(managedExisting.id));
          continue;
        }

        if (occupiedBySlotKey.has(slotKey)) {
          continue;
        }

        const liveExisting = await trx('assignments')
          .select('id', 'assignable_type', 'assignable_id', 'is_manual')
          .where({
            room_id: roomId,
            date,
            start_time: entry.start_time,
            end_time: entry.end_time,
            status: 'active'
          })
          .first();

        if (liveExisting) {
          if (
            liveExisting.assignable_type === 'event' &&
            String(liveExisting.assignable_id) === roomId &&
            liveExisting.is_manual === false
          ) {
            await trx('assignments')
              .where({ id: liveExisting.id })
              .update({
                time_slots: buildAuditoriumTimeSlots({
                  start_time: entry.start_time,
                  end_time: entry.end_time,
                  title: entry.title,
                  note: entry.note ?? null,
                  source_entry_id: sourceEntryId || null
                }),
                updated_at: trx.fn.now()
              });
            retainedManagedIds.add(String(liveExisting.id));
          }
          continue;
        }

        const assignmentPayload = {
          type: 'one_time',
          assignable_type: 'event',
          assignable_id: roomId,
          room_id: roomId,
          activity_type: 'event',
          created_by: actorId,
            start_date: date,
            date,
            specific_date: date,
            end_date: date,
            start_time: entry.start_time,
            end_time: entry.end_time,
            days_of_week: JSON.stringify([getDayOfWeek(date)]),
            time_slots: buildAuditoriumTimeSlots({
              start_time: entry.start_time,
              end_time: entry.end_time,
              title: entry.title,
              note: entry.note ?? null,
              source_entry_id: sourceEntryId || null
            }),
            is_manual: false,
            status: 'active',
            created_at: trx.fn.now(),
            updated_at: trx.fn.now()
        };

        const insertedAssignments = await trx.raw(
          `
            INSERT INTO assignments (
              type,
              assignable_type,
              assignable_id,
              room_id,
              activity_type,
              created_by,
              start_date,
              date,
              specific_date,
              end_date,
              start_time,
              end_time,
              days_of_week,
              time_slots,
              is_manual,
              status,
              created_at,
              updated_at
            )
            SELECT
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?,
              ?::jsonb, ?::jsonb, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
              SELECT 1
              FROM assignments
              WHERE room_id = ?
                AND date = ?
                AND start_time = ?
                AND end_time = ?
                AND status = 'active'
            )
            RETURNING id, room_id, date, start_time, end_time, time_slots
          `,
          [
            assignmentPayload.type,
            assignmentPayload.assignable_type,
            assignmentPayload.assignable_id,
            assignmentPayload.room_id,
            assignmentPayload.activity_type,
            assignmentPayload.created_by,
            assignmentPayload.start_date,
            assignmentPayload.date,
            assignmentPayload.specific_date,
            assignmentPayload.end_date,
            assignmentPayload.start_time,
            assignmentPayload.end_time,
            assignmentPayload.days_of_week,
            assignmentPayload.time_slots,
            assignmentPayload.is_manual,
            assignmentPayload.status,
            roomId,
            date,
            entry.start_time,
            entry.end_time
          ]
        );

        const savedAssignment = insertedAssignments.rows?.[0];
        if (savedAssignment) {
          retainedManagedIds.add(String(savedAssignment.id));
          existingByKey.set(buildExistingAssignmentKey(savedAssignment), savedAssignment);
          managedBySlotKey.set(slotKey, savedAssignment);
          occupiedBySlotKey.set(slotKey, savedAssignment);
          continue;
        }

        const existingAfterInsertAttempt = await trx('assignments')
          .select('id', 'room_id', 'date', 'start_time', 'end_time', 'time_slots', 'assignable_type', 'assignable_id', 'is_manual')
          .where({
            room_id: roomId,
            date,
            start_time: entry.start_time,
            end_time: entry.end_time,
            status: 'active'
          })
          .first();

        if (
          existingAfterInsertAttempt &&
          existingAfterInsertAttempt.assignable_type === 'event' &&
          String(existingAfterInsertAttempt.assignable_id) === roomId &&
          existingAfterInsertAttempt.is_manual === false
        ) {
          const updatedTimeSlots = buildAuditoriumTimeSlots({
            start_time: entry.start_time,
            end_time: entry.end_time,
            title: entry.title,
            note: entry.note ?? null,
            source_entry_id: sourceEntryId || null
          });

          await trx('assignments')
            .where({ id: existingAfterInsertAttempt.id })
            .update({
              time_slots: updatedTimeSlots,
              updated_at: trx.fn.now()
            });

          const refreshedAssignment = {
            ...existingAfterInsertAttempt,
            time_slots: updatedTimeSlots
          };

          retainedManagedIds.add(String(existingAfterInsertAttempt.id));
          existingByKey.set(buildExistingAssignmentKey(refreshedAssignment), refreshedAssignment);
          managedBySlotKey.set(slotKey, refreshedAssignment);
          occupiedBySlotKey.set(slotKey, refreshedAssignment);
        }
      }
    }
  }

  const obsoleteAssignmentIds = existingAssignments
    .filter((assignment: any) => !retainedManagedIds.has(String(assignment.id)) && !desiredKeys.has(buildExistingAssignmentKey(assignment)))
    .map((assignment: any) => assignment.id);

  if (obsoleteAssignmentIds.length > 0) {
    await trx('assignments')
      .whereIn('id', obsoleteAssignmentIds)
      .delete();
  }
};

export const syncAuditoriumDefaults = async (
  trx: Knex | Knex.Transaction,
  startDate: string,
  createdBy?: string | null
) => {
  const rooms = await trx('rooms')
    .select('id')
    .where({ is_active: true })
    .whereRaw(`UPPER(CAST(room_type AS TEXT)) = 'AUDITORIUM'`);

  if (rooms.length === 0) {
    return;
  }

  await applyAuditoriumDefaultSettingsToAssignments(
    trx as Knex.Transaction,
    rooms.map((room: any) => String(room.id)),
    startDate,
    createdBy
  );
};
