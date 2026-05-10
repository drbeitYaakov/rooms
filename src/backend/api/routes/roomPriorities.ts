import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireAdmin } from '../../middleware/auth';
import logger from '../../utils/logger';
import {
  buildEmptyRoomPrioritySettings,
  classifyRoomPriorityType,
  loadRoomPrioritySettings,
  normalizeRoomPriorityType,
  ROOM_PRIORITY_TYPE_LABELS,
  ROOM_PRIORITY_TYPES,
  saveRoomPrioritySettings
} from '../../utils/roomPreferenceSettings';

const router = Router();

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

router.get('/', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [settings, rooms] = await Promise.all([
      loadRoomPrioritySettings(db),
      db('rooms')
        .select('id', 'room_number', 'room_type', 'notes', 'grade_level', 'is_active')
        .where({ is_active: true })
        .orderBy('room_number', 'asc')
    ]);

    const roomsWithPreferenceType = rooms.map((room: any) => ({
      id: String(room.id),
      room_number: room.room_number,
      room_type: room.room_type,
      preference_type: classifyRoomPriorityType(room),
      preference_label: ROOM_PRIORITY_TYPE_LABELS[classifyRoomPriorityType(room)]
    }));

    res.json({
      success: true,
      data: {
        room_types: ROOM_PRIORITY_TYPES.map((type) => ({
          key: type,
          label: ROOM_PRIORITY_TYPE_LABELS[type]
        })),
        rooms: roomsWithPreferenceType,
        settings
      }
    });
  } catch (error) {
    logger.error('Error fetching room priority settings:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת הגדרות עדיפות החדרים נכשלה'
    });
  }
});

router.put('/', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const defaultsInput = Array.isArray(req.body?.defaults) ? req.body.defaults : [];
    const overridesInput = Array.isArray(req.body?.overrides) ? req.body.overrides : [];

    const defaults = defaultsInput
      .map((item: any) => {
        const roomType = normalizeRoomPriorityType(item?.room_type);
        if (!roomType) {
          return null;
        }

        return {
          room_type: roomType,
          room_ids: Array.isArray(item?.room_ids)
            ? item.room_ids.map((id: unknown) => String(id || '').trim()).filter((id: string) => id !== '')
            : []
        };
      })
      .filter((item: {
        room_type: string;
        room_ids: string[];
      } | null): item is {
        room_type: string;
        room_ids: string[];
      } => item !== null);

    const overrides = overridesInput
      .map((item: any) => {
        const roomType = normalizeRoomPriorityType(item?.room_type);
        const startTime = typeof item?.start_time === 'string' ? item.start_time : '';
        const endTime = typeof item?.end_time === 'string' ? item.end_time : '';

        if (!roomType || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime) || startTime >= endTime) {
          return null;
        }

        return {
          id: typeof item?.id === 'string' ? item.id : undefined,
          room_type: roomType,
          days_of_week: normalizeDaysOfWeek(item?.days_of_week),
          start_time: startTime,
          end_time: endTime,
          room_ids: Array.isArray(item?.room_ids)
            ? item.room_ids.map((id: unknown) => String(id || '').trim()).filter((id: string) => id !== '')
            : []
        };
      })
      .filter((item: {
        id?: string;
        room_type: string;
        days_of_week: number[];
        start_time: string;
        end_time: string;
        room_ids: string[];
      } | null): item is {
        id?: string;
        room_type: string;
        days_of_week: number[];
        start_time: string;
        end_time: string;
        room_ids: string[];
      } => item !== null);

    await db.transaction(async (trx) => {
      const nextSettings = buildEmptyRoomPrioritySettings();
      nextSettings.defaults = defaults;
      nextSettings.overrides = overrides;
      await saveRoomPrioritySettings(trx, nextSettings);
    });

    res.json({
      success: true,
      message: 'הגדרות עדיפות החדרים נשמרו בהצלחה'
    });
  } catch (error) {
    logger.error('Error saving room priority settings:', error);
    res.status(500).json({
      success: false,
      error: 'שמירת הגדרות עדיפות החדרים נכשלה'
    });
  }
});

export default router;
