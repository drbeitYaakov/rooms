import logger from '../../utils/logger';

const SYSTEM_CREATED_BY = '9ebc15a4-6b60-5483-85df-6eb5c30ffae5';
const INSERT_CHUNK_SIZE = 250;

export interface HomeroomAssignmentTarget {
  id: number | string;
  room_id: string;
  display_name?: string;
}

export interface CreateHomeroomAssignmentsOptions {
  createdBy?: string | null;
  startDate?: Date;
  endDate?: Date;
  throwOnError?: boolean;
}

function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function resolveAssignmentCreatedBy(userId?: string | null): string {
  return isUuid(userId) ? userId : SYSTEM_CREATED_BY;
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultSchoolYearRange(): { start: Date; end: Date } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const september = new Date(currentYear, 8, 1);
  const start = now >= september ? september : new Date(currentYear - 1, 8, 1);
  const end = new Date(start.getFullYear() + 1, 5, 30);
  return { start, end };
}

function toLocalDate(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * Creates weekday homeroom occupancy 08:00-14:40, Sunday-Friday.
 * Live DB only allows assignment type one_time, matching existing homeroom rows.
 */
export async function createHomeroomAssignments(
  dbOrTrx: any,
  homeroom: HomeroomAssignmentTarget,
  options: CreateHomeroomAssignmentsOptions = {}
): Promise<{ created: number; skipped: number }> {
  try {
    if (!homeroom?.id || !homeroom.room_id) {
      throw new Error('חסר מזהה כיתת אם או חדר ליצירת שיבוצים');
    }

    const range = options.startDate && options.endDate
      ? { start: toLocalDate(options.startDate), end: toLocalDate(options.endDate) }
      : defaultSchoolYearRange();

    const createdBy = resolveAssignmentCreatedBy(options.createdBy);
    const displayName = homeroom.display_name || String(homeroom.id);
    logger.info(`Creating assignments for homeroom ${displayName}`);

    const existingRows = await dbOrTrx('assignments')
      .select('date')
      .where({
        assignable_type: 'homeroom',
        assignable_id: String(homeroom.id),
        status: 'active'
      });

    const existingDates = new Set(
      existingRows
        .map((row: { date?: string | Date }) => {
          if (!row.date) return '';
          if (row.date instanceof Date) return formatLocalDate(row.date);
          return String(row.date).split('T')[0];
        })
        .filter(Boolean)
    );

    const rows: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (let date = new Date(range.start); date <= range.end; date.setDate(date.getDate() + 1)) {
      if (date.getDay() === 6) {
        continue;
      }

      const dateStr = formatLocalDate(date);
      if (existingDates.has(dateStr)) {
        skipped += 1;
        continue;
      }

      rows.push({
        type: 'one_time',
        assignable_type: 'homeroom',
        assignable_id: String(homeroom.id),
        room_id: homeroom.room_id,
        activity_type: 'לימודים',
        created_by: createdBy,
        start_date: dateStr,
        date: dateStr,
        start_time: '08:00',
        end_time: '14:40',
        days_of_week: [date.getDay()],
        time_slots: [{ start: '08:00', end: '14:40' }],
        is_manual: false,
        status: 'active',
        created_at: dbOrTrx.fn?.now ? dbOrTrx.fn.now() : new Date(),
        updated_at: dbOrTrx.fn?.now ? dbOrTrx.fn.now() : new Date()
      });
    }

    for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
      await dbOrTrx('assignments').insert(rows.slice(i, i + INSERT_CHUNK_SIZE));
    }

    logger.info(
      `Created ${rows.length} assignments for homeroom ${displayName} from ${formatLocalDate(range.start)} to ${formatLocalDate(range.end)}`
    );

    return { created: rows.length, skipped };
  } catch (error) {
    logger.error('Error creating homeroom assignments:', error);
    if (options.throwOnError) {
      throw error;
    }
    return { created: 0, skipped: 0 };
  }
}
