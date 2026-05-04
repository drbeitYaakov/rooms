import { Router, Response } from 'express';
import { db } from '../../config/database';
import logger from '../../utils/logger';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth';
import {
  applyAuditoriumDefaultSettingsToAssignments,
  buildAuditoriumWeeklySchedule,
  DEFAULT_AUDITORIUM_END_TIME,
  DEFAULT_AUDITORIUM_START_TIME,
  loadAuditoriumDefaultSchedule,
  normalizeAuditoriumWeeklySchedule,
  saveAuditoriumOverrideSetting
} from '../../utils/auditoriumDefaults';

const router = Router();

function normalizeDateOnly(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.includes('T') ? value.split('T')[0] : value;
  }

  const parsed = new Date(value as string);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function parseWeeklyScheduleInput(value: unknown) {
  const schedule = normalizeAuditoriumWeeklySchedule(value);
  return schedule.length > 0 ? schedule : null;
}

const getToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

router.get('/default-settings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [schedule, auditoriums] = await Promise.all([
      loadAuditoriumDefaultSchedule(db),
      db('rooms')
        .select('id', 'room_number', 'room_type', 'floor', 'wing')
        .where({ is_active: true })
        .whereRaw(`UPPER(CAST(room_type AS TEXT)) = 'AUDITORIUM'`)
        .orderBy('room_number', 'asc')
    ]);

    const auditoriumMap = new Map(
      auditoriums.map((room: any) => [String(room.id), room])
    );

    res.json({
      success: true,
      data: {
        system_default: {
          start_time: DEFAULT_AUDITORIUM_START_TIME,
          end_time: DEFAULT_AUDITORIUM_END_TIME,
          weekly_schedule: buildAuditoriumWeeklySchedule()
        },
        auditoriums,
        room_overrides: schedule.roomOverrides.map((setting) => ({
          ...setting,
          room_name: auditoriumMap.get(String(setting.room_id ?? ''))?.room_number ?? null
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching auditorium default settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch auditorium default settings'
    });
  }
});

router.put('/default-settings/room', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { room_id, effective_from, weekly_schedule, selected_changes } = req.body ?? {};
    const normalizedDate = normalizeDateOnly(effective_from);
    const roomId = typeof room_id === 'string' ? room_id : '';
    const normalizedWeeklySchedule = parseWeeklyScheduleInput(weekly_schedule);
    const normalizedSelectedChanges = Array.isArray(selected_changes)
      ? selected_changes
          .map((change) => ({
            day_of_week: Number(change?.day_of_week),
            entry_id: typeof change?.entry_id === 'string' ? change.entry_id.trim() : ''
          }))
          .filter((change) => Number.isInteger(change.day_of_week) && change.day_of_week >= 0 && change.day_of_week <= 5 && change.entry_id !== '')
      : [];

    if (!roomId || !normalizedDate || !normalizedWeeklySchedule) {
      return res.status(400).json({
        success: false,
        error: 'room_id, effective_from and weekly_schedule are required'
      });
    }

    const auditorium = await db('rooms')
      .select('id')
      .where({ id: roomId, is_active: true })
      .whereRaw(`UPPER(CAST(room_type AS TEXT)) = 'AUDITORIUM'`)
      .first();

    if (!auditorium) {
      return res.status(404).json({
        success: false,
        error: 'Auditorium room not found'
      });
    }

    await db.transaction(async (trx) => {
      await saveAuditoriumOverrideSetting(trx, {
        room_id: roomId,
        effective_from: normalizedDate,
        weekly_schedule: normalizedWeeklySchedule,
        updated_by: req.user?.id ?? null,
        selected_changes: normalizedSelectedChanges
      });

      await applyAuditoriumDefaultSettingsToAssignments(
        trx,
        [roomId],
        normalizedDate,
        req.user?.id ?? null
      );
    });

    res.json({
      success: true,
      message: 'Auditorium override saved successfully'
    });
  } catch (error) {
    logger.error('Error saving auditorium override setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save auditorium override setting'
    });
  }
});

router.post('/sync-defaults', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const startDate = normalizeDateOnly(req.body?.start_date) ?? getToday();
    const auditoriumIds = (
      await db('rooms')
        .pluck('id')
        .where({ is_active: true })
        .whereRaw(`UPPER(CAST(room_type AS TEXT)) = 'AUDITORIUM'`)
    ).map((id: unknown) => String(id));

    await db.transaction(async (trx) => {
      await applyAuditoriumDefaultSettingsToAssignments(trx, auditoriumIds, startDate, req.user?.id ?? null);
    });

    res.json({
      success: true
    });
  } catch (error) {
    logger.error('Error syncing auditorium defaults:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync auditorium defaults'
    });
  }
});

export default router;
