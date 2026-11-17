import * as ExcelJS from 'exceljs';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { getRoomLocation } from '../models/Room';
import {
  formatAcademicYearDate,
  getActiveAcademicYear,
  getAcademicYearSchoolYearLabel
} from '../../utils/academicYears';
import { createHomeroomAssignments, resolveAssignmentCreatedBy } from './createHomeroomAssignments';

export const HOMEROOM_SHEET_NAME = 'שיבוץ כיתות אם';
const DEFAULT_CAPACITY = 35;
const ALLOWED_GRADES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו'] as const;

const GRADE_TO_ROOM_TYPE: Record<string, string> = {
  א: 'CLASSROOM_A',
  ב: 'CLASSROOM_B',
  ג: 'CLASSROOM_C',
  ד: 'CLASSROOM_D',
  ה: 'CLASSROOM_E',
  ו: 'CLASSROOM_F'
};

export type ImportRowAction =
  | 'create_room_and_assign'
  | 'assign_existing_room'
  | 'update_existing_homeroom'
  | 'skipped'
  | 'error';

export interface ImportRowResult {
  excelRow: number;
  classLabel: string;
  gradeName: string;
  classNumber: number | null;
  roomNumber: string;
  action: ImportRowAction;
  message: string;
  existingAssignmentCount: number;
}

export interface HomeroomImportPreview {
  school_year: string;
  summary: {
    total: number;
    create_room_and_assign: number;
    assign_existing_room: number;
    update_existing_homeroom: number;
    skipped: number;
    errors: number;
    rooms_with_assignments: number;
    assignments_to_delete: number;
  };
  requires_delete_confirmation: boolean;
  rooms_with_assignments: Array<{
    room_number: string;
    assignment_count: number;
  }>;
  rows: ImportRowResult[];
}

export interface HomeroomImportCommitResult extends HomeroomImportPreview {
  deleted_assignments: number;
  created_rooms: number;
  upserted_homerooms: number;
  created_assignments: number;
}

interface ParsedExcelRow {
  excelRow: number;
  classLabel: string;
  gradeName: string;
  classNumber: number;
  roomNumber: string;
}

interface PlannedRow extends ParsedExcelRow {
  action: ImportRowAction;
  message: string;
  existingAssignmentCount: number;
  gradeId?: string;
  existingRoom?: any;
  existingHomeroom?: any;
  occupyingHomeroom?: any;
}

function cellText(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'object') {
    const rich = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof rich.text === 'string') {
      return rich.text.trim();
    }
    if (Array.isArray(rich.richText)) {
      return rich.richText.map((part) => part.text || '').join('').trim();
    }
    if (rich.result !== undefined) {
      return cellText(rich.result);
    }
  }

  return String(value).trim();
}

export function normalizeRoomNumber(value: unknown): string {
  const text = cellText(value).replace(/\.0$/, '');
  if (!text) {
    return '';
  }
  if (/^\d+$/.test(text)) {
    return String(parseInt(text, 10));
  }
  return text;
}

export function parseClassLabel(raw: unknown): { gradeName: string; classNumber: number } | null {
  const normalized = cellText(raw).replace(/[׳'’]/g, "'");
  const match = normalized.match(/^([א-ת])'?\s*-?\s*(\d+)$/);
  if (!match) {
    return null;
  }

  const gradeName = match[1];
  const classNumber = parseInt(match[2], 10);
  if (!ALLOWED_GRADES.includes(gradeName as typeof ALLOWED_GRADES[number])) {
    return null;
  }
  if (!Number.isInteger(classNumber) || classNumber < 1 || classNumber > 7) {
    return null;
  }

  return { gradeName, classNumber };
}

function buildClassLabel(gradeName: string, classNumber: number): string {
  return `${gradeName}'${classNumber}`;
}

function countByAction(rows: ImportRowResult[], action: ImportRowAction): number {
  return rows.filter((row) => row.action === action).length;
}

async function parseHomeroomSheet(buffer: Buffer): Promise<ParsedExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  const sheet =
    workbook.getWorksheet(HOMEROOM_SHEET_NAME) ||
    workbook.worksheets.find((ws) => String(ws.name || '').trim() === HOMEROOM_SHEET_NAME);

  if (!sheet) {
    const error: any = new Error(`לא נמצא גיליון בשם "${HOMEROOM_SHEET_NAME}"`);
    error.statusCode = 400;
    throw error;
  }

  const parsed: ParsedExcelRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    const classLabel = cellText(row.getCell(2).value);
    const roomNumber = normalizeRoomNumber(row.getCell(3).value);
    if (!classLabel && !roomNumber) {
      return;
    }

    const parsedClass = parseClassLabel(classLabel);
    if (!parsedClass || !roomNumber) {
      parsed.push({
        excelRow: rowNumber,
        classLabel: classLabel || '',
        gradeName: parsedClass?.gradeName || '',
        classNumber: parsedClass?.classNumber || 0,
        roomNumber
      });
      return;
    }

    parsed.push({
      excelRow: rowNumber,
      classLabel: buildClassLabel(parsedClass.gradeName, parsedClass.classNumber),
      gradeName: parsedClass.gradeName,
      classNumber: parsedClass.classNumber,
      roomNumber
    });
  });

  if (parsed.length === 0) {
    const error: any = new Error('הגיליון ריק או שלא נמצאו שורות שיבוץ');
    error.statusCode = 400;
    throw error;
  }

  return parsed;
}

function mapWingAndSide(roomNumber: string): { floor: number; wing: string; side: string | null } {
  const location = getRoomLocation(roomNumber);
  return {
    floor: location.floor,
    wing: location.wing === 'new' ? 'OLD' : location.wing.toUpperCase(),
    side: location.section === 'center' ? null : location.section
  };
}

async function loadImportContext() {
  const activeYear = await getActiveAcademicYear(db);
  if (!activeYear) {
    const error: any = new Error('לא נמצאה שנת לימודים פעילה');
    error.statusCode = 400;
    throw error;
  }

  const schoolYear = getAcademicYearSchoolYearLabel(activeYear);
  if (!schoolYear) {
    const error: any = new Error('לשנת הלימודים הפעילה אין שם תקין');
    error.statusCode = 400;
    throw error;
  }

  const [grades, rooms, homerooms, assignmentCounts] = await Promise.all([
    db('grades').where({ year_id: activeYear.id }).select('id', 'name', 'year_id'),
    db('rooms').select('*'),
    db('homerooms as h')
      .leftJoin(db.raw('grades as g ON g.id::text = h.grade_id::text'))
      .leftJoin(db.raw('rooms as r ON r.id::text = h.room_id::text'))
      .select('h.*', 'g.name as grade_name', 'r.room_number')
      .where('h.school_year', schoolYear),
    db('assignments as a')
      .join(db.raw('rooms as r ON r.id::text = a.room_id::text'))
      .where('a.status', 'active')
      .groupBy('r.id', 'r.room_number')
      .select('r.id as room_id', 'r.room_number')
      .count('* as assignment_count')
  ]);

  const gradesByName = new Map<string, any>(grades.map((grade: any) => [String(grade.name).trim(), grade]));
  const roomsByNumber = new Map<string, any>(
    rooms.map((room: any) => [normalizeRoomNumber(room.room_number), room])
  );
  const homeroomsByClass = new Map<string, any>(
    homerooms.map((homeroom: any) => [`${homeroom.grade_name}:${homeroom.class_number}`, homeroom])
  );
  const homeroomsByRoomId = new Map<string, any>();
  for (const homeroom of homerooms) {
    if (homeroom.room_id) {
      homeroomsByRoomId.set(String(homeroom.room_id), homeroom);
    }
  }
  const assignmentsByRoomNumber = new Map<string, number>();
  for (const row of assignmentCounts) {
    assignmentsByRoomNumber.set(
      normalizeRoomNumber(row.room_number),
      Number(row.assignment_count || 0)
    );
  }

  return {
    activeYear,
    schoolYear,
    gradesByName,
    roomsByNumber,
    homeroomsByClass,
    homeroomsByRoomId,
    assignmentsByRoomNumber
  };
}

function planRows(
  parsedRows: ParsedExcelRow[],
  context: Awaited<ReturnType<typeof loadImportContext>>
): PlannedRow[] {
  const classSeen = new Map<string, number>();
  const roomSeen = new Map<string, number>();

  return parsedRows.map((row) => {
    const classKey = `${row.gradeName}:${row.classNumber}`;
    const planned: PlannedRow = {
      ...row,
      action: 'error',
      message: '',
      existingAssignmentCount: context.assignmentsByRoomNumber.get(row.roomNumber) || 0
    };

    if (!row.gradeName || !row.classNumber || !row.roomNumber) {
      planned.message = 'לא ניתן לקרוא כיתה או מספר חדר בשורה זו';
      return planned;
    }

    const previousClassRow = classSeen.get(classKey);
    if (previousClassRow) {
      planned.message = `הכיתה ${row.classLabel} מופיעה יותר מפעם אחת בקובץ (גם בשורה ${previousClassRow})`;
      return planned;
    }
    classSeen.set(classKey, row.excelRow);

    const previousRoomRow = roomSeen.get(row.roomNumber);
    if (previousRoomRow) {
      planned.message = `חדר ${row.roomNumber} מופיע יותר מפעם אחת בקובץ (גם בשורה ${previousRoomRow})`;
      return planned;
    }
    roomSeen.set(row.roomNumber, row.excelRow);

    const grade = context.gradesByName.get(row.gradeName);
    if (!grade) {
      planned.message = `שכבה ${row.gradeName} לא נמצאה בשנת הלימודים הפעילה`;
      return planned;
    }
    planned.gradeId = String(grade.id);

    try {
      mapWingAndSide(row.roomNumber);
    } catch {
      planned.message = `מספר חדר ${row.roomNumber} אינו בפורמט תקין ליצירת חדר`;
      return planned;
    }

    const existingRoom = context.roomsByNumber.get(row.roomNumber);
    planned.existingRoom = existingRoom;
    const existingHomeroom = context.homeroomsByClass.get(classKey);
    planned.existingHomeroom = existingHomeroom;
    planned.occupyingHomeroom = existingRoom
      ? context.homeroomsByRoomId.get(String(existingRoom.id))
      : undefined;

    if (!existingRoom) {
      planned.action = 'create_room_and_assign';
      planned.message = `החדר ${row.roomNumber} לא קיים — ייווצר ואז תשובץ כיתה ${row.classLabel}`;
      return planned;
    }

    const occupyingClass = planned.occupyingHomeroom
      ? `${planned.occupyingHomeroom.grade_name}'${planned.occupyingHomeroom.class_number}`
      : '';

    if (existingHomeroom && String(existingHomeroom.room_id) === String(existingRoom.id)) {
      planned.action = 'skipped';
      planned.message = planned.existingAssignmentCount > 0
        ? `כיתה ${row.classLabel} כבר משובצת לחדר ${row.roomNumber}. אחרי אישור יימחקו השיבוצים הקיימים ויווצרו מחדש`
        : `כיתה ${row.classLabel} כבר משובצת לחדר ${row.roomNumber}`;
      return planned;
    }

    if (existingHomeroom) {
      planned.action = 'update_existing_homeroom';
      planned.message = occupyingClass && occupyingClass !== row.classLabel
        ? `כיתה ${row.classLabel} תועבר לחדר ${row.roomNumber} במקום ${occupyingClass}`
        : `כיתה ${row.classLabel} תועבר לחדר ${row.roomNumber}`;
      return planned;
    }

    planned.action = 'assign_existing_room';
    planned.message = occupyingClass
      ? `חדר ${row.roomNumber} קיים ותשובץ אליו כיתה ${row.classLabel} במקום ${occupyingClass}`
      : `חדר ${row.roomNumber} קיים ותשובץ אליו כיתה ${row.classLabel}`;
    return planned;
  });
}

function toPreview(schoolYear: string, plannedRows: PlannedRow[]): HomeroomImportPreview {
  const rows: ImportRowResult[] = plannedRows.map((row) => ({
    excelRow: row.excelRow,
    classLabel: row.classLabel,
    gradeName: row.gradeName,
    classNumber: row.classNumber || null,
    roomNumber: row.roomNumber,
    action: row.action,
    message: row.message,
    existingAssignmentCount: row.existingAssignmentCount
  }));

  const roomsWithAssignments = [
    ...new Map(
      plannedRows
        .filter((row) => row.action !== 'error' && row.existingAssignmentCount > 0)
        .map((row) => [row.roomNumber, {
          room_number: row.roomNumber,
          assignment_count: row.existingAssignmentCount
        }])
    ).values()
  ];

  const assignmentsToDelete = roomsWithAssignments.reduce((sum, room) => sum + room.assignment_count, 0);

  return {
    school_year: schoolYear,
    summary: {
      total: rows.length,
      create_room_and_assign: countByAction(rows, 'create_room_and_assign'),
      assign_existing_room: countByAction(rows, 'assign_existing_room'),
      update_existing_homeroom: countByAction(rows, 'update_existing_homeroom'),
      skipped: countByAction(rows, 'skipped'),
      errors: countByAction(rows, 'error'),
      rooms_with_assignments: roomsWithAssignments.length,
      assignments_to_delete: assignmentsToDelete
    },
    requires_delete_confirmation: assignmentsToDelete > 0,
    rooms_with_assignments: roomsWithAssignments,
    rows
  };
}

export async function previewHomeroomExcelImport(buffer: Buffer): Promise<HomeroomImportPreview> {
  const parsedRows = await parseHomeroomSheet(buffer);
  const context = await loadImportContext();
  return toPreview(context.schoolYear, planRows(parsedRows, context));
}

async function createMissingRoom(trx: any, roomNumber: string, gradeName: string) {
  const location = mapWingAndSide(roomNumber);
  const [room] = await trx('rooms')
    .insert({
      room_number: roomNumber,
      floor: location.floor,
      wing: location.wing,
      side: location.side,
      room_type: GRADE_TO_ROOM_TYPE[gradeName] || 'CLASSROOM_A',
      capacity: DEFAULT_CAPACITY,
      has_projector: false,
      is_small: false,
      is_active: true,
      created_at: trx.fn.now(),
      updated_at: trx.fn.now()
    })
    .returning('*');

  return room;
}

export async function commitHomeroomExcelImport(options: {
  buffer: Buffer;
  deleteExistingAssignments: boolean;
  userId?: string | null;
}): Promise<HomeroomImportCommitResult> {
  const parsedRows = await parseHomeroomSheet(options.buffer);
  const context = await loadImportContext();
  const plannedRows = planRows(parsedRows, context);
  const preview = toPreview(context.schoolYear, plannedRows);

  if (preview.requires_delete_confirmation && !options.deleteExistingAssignments) {
    const error: any = new Error('יש שיבוצים קיימים בחדרים שבקובץ. נדרש אישור למחוק אותם לפני שיבוץ כיתות האם');
    error.statusCode = 409;
    error.preview = preview;
    throw error;
  }

  const validRows = plannedRows.filter((row) => row.action !== 'error');
  const createdBy = resolveAssignmentCreatedBy(options.userId);
  const startDate = formatAcademicYearDate(context.activeYear.start_date);
  const endDate = formatAcademicYearDate(context.activeYear.end_date);
  const assignmentRange = {
    startDate: startDate ? new Date(`${startDate}T00:00:00`) : undefined,
    endDate: endDate ? new Date(`${endDate}T00:00:00`) : undefined
  };

  const commitState = {
    deleted_assignments: 0,
    created_rooms: 0,
    upserted_homerooms: 0,
    created_assignments: 0,
    homeroomsToSchedule: [] as Array<{ id: number | string; room_id: string; display_name: string }>
  };

  await db.transaction(async (trx) => {
    const roomIdsToClear = new Set<string>();
    const homeroomIdsToClear = new Set<string>();

    for (const row of validRows) {
      let room = row.existingRoom;
      if (!room) {
        room = await createMissingRoom(trx, row.roomNumber, row.gradeName);
        commitState.created_rooms += 1;
        row.existingRoom = room;
      }

      roomIdsToClear.add(String(room.id));

      if (row.existingHomeroom?.id) {
        homeroomIdsToClear.add(String(row.existingHomeroom.id));
        if (row.existingHomeroom.room_id) {
          roomIdsToClear.add(String(row.existingHomeroom.room_id));
        }
      }
    }

    if (options.deleteExistingAssignments) {
      if (roomIdsToClear.size > 0) {
        commitState.deleted_assignments += await trx('assignments')
          .whereIn('room_id', [...roomIdsToClear])
          .andWhere({ status: 'active' })
          .del();
      }

      if (homeroomIdsToClear.size > 0) {
        commitState.deleted_assignments += await trx('assignments')
          .where({ assignable_type: 'homeroom', status: 'active' })
          .whereIn('assignable_id', [...homeroomIdsToClear])
          .del();
      }
    }

    for (const row of validRows) {
      const room = row.existingRoom;
      const className = buildClassLabel(row.gradeName, row.classNumber);

      if (row.existingHomeroom) {
        const [updated] = await trx('homerooms')
          .where({ id: row.existingHomeroom.id })
          .update({
            room_id: String(room.id),
            class_name: className,
            is_active: true,
            updated_at: trx.fn.now()
          })
          .returning('*');

        commitState.upserted_homerooms += 1;
        commitState.homeroomsToSchedule.push({
          id: updated.id,
          room_id: String(room.id),
          display_name: className
        });
        continue;
      }

      const [created] = await trx('homerooms')
        .insert({
          room_id: String(room.id),
          grade_id: row.gradeId,
          class_number: row.classNumber,
          max_students: DEFAULT_CAPACITY,
          current_students: 0,
          school_year: context.schoolYear,
          class_name: className,
          is_active: true,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now()
        })
        .returning('*');

      commitState.upserted_homerooms += 1;
      commitState.homeroomsToSchedule.push({
        id: created.id,
        room_id: String(room.id),
        display_name: className
      });
    }
  });

  for (const homeroom of commitState.homeroomsToSchedule) {
    const result = await createHomeroomAssignments(db, homeroom, {
      createdBy,
      startDate: assignmentRange.startDate,
      endDate: assignmentRange.endDate,
      throwOnError: true
    });
    commitState.created_assignments += result.created;
  }

  logger.info('Homeroom excel import completed', {
    schoolYear: context.schoolYear,
    ...commitState
  });

  return {
    ...preview,
    deleted_assignments: commitState.deleted_assignments,
    created_rooms: commitState.created_rooms,
    upserted_homerooms: commitState.upserted_homerooms,
    created_assignments: commitState.created_assignments
  };
}
