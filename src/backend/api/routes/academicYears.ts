import { randomUUID } from 'crypto';
import { Router, Response } from 'express';
import { db } from '../../config/database';
import { authMiddleware, AuthenticatedRequest, requireAdmin } from '../../middleware/auth';
import logger from '../../utils/logger';
import {
  cloneAcademicYearBaseData,
  formatAcademicYearDate,
  getAcademicYearById,
  getAcademicYearSchoolYearLabel,
  getActiveAcademicYear,
  isAcademicYearInitialized,
} from '../../utils/academicYears';

const router = Router();

function serializeAcademicYear(year: any) {
  return {
    id: year.id,
    year_name: year.year_name,
    start_date: formatAcademicYearDate(year.start_date),
    end_date: formatAcademicYearDate(year.end_date),
    is_active: Boolean(year.is_active),
    is_archived: Boolean(year.is_archived),
    created_at: year.created_at,
    updated_at: year.updated_at,
    school_year_label: getAcademicYearSchoolYearLabel(year),
  };
}

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const years = await db('academic_years')
      .orderBy('start_date', 'desc')
      .orderBy('created_at', 'desc');

    res.json({
      success: true,
      data: {
        academic_years: years.map(serializeAcademicYear),
      },
    });
  } catch (error) {
    logger.error('Error fetching academic years:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת שנות הלימוד נכשלה',
    });
  }
});

router.get('/active', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const activeYear = await getActiveAcademicYear(db);

    res.json({
      success: true,
      data: {
        academic_year: activeYear ? serializeAcademicYear(activeYear) : null,
      },
    });
  } catch (error) {
    logger.error('Error fetching active academic year:', error);
    res.status(500).json({
      success: false,
      error: 'טעינת שנת הלימוד הפעילה נכשלה',
    });
  }
});

router.post('/', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { year_name, start_date, end_date, is_active, is_archived } = req.body ?? {};

    if (!year_name || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'חובה למלא year_name, start_date ו-end_date',
      });
    }

    const normalizedStartDate = formatAcademicYearDate(start_date);
    const normalizedEndDate = formatAcademicYearDate(end_date);

    if (!normalizedStartDate || !normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: 'הוזנו תאריכים לא תקינים',
      });
    }

    if (normalizedStartDate > normalizedEndDate) {
      return res.status(400).json({
        success: false,
        error: 'תאריך ההתחלה חייב להיות מוקדם מתאריך הסיום',
      });
    }

    const existingYear = await db('academic_years')
      .whereRaw('LOWER(year_name) = LOWER(?)', [String(year_name).trim()])
      .first();

    if (existingYear) {
      return res.status(400).json({
        success: false,
        error: 'כבר קיימת שנת לימוד בשם הזה',
      });
    }

    let createdYear: any = null;

    await db.transaction(async (trx) => {
      if (is_active === true) {
        await trx('academic_years').update({
          is_active: false,
          updated_at: trx.fn.now(),
        });
      }

      [createdYear] = await trx('academic_years')
        .insert({
          id: randomUUID(),
          year_name: String(year_name).trim(),
          start_date: normalizedStartDate,
          end_date: normalizedEndDate,
          is_active: is_active === true,
          is_archived: is_archived === true,
          created_at: trx.fn.now(),
          updated_at: trx.fn.now(),
        })
        .returning('*');
    });

    res.status(201).json({
      success: true,
      data: {
        academic_year: serializeAcademicYear(createdYear),
      },
    });
  } catch (error) {
    logger.error('Error creating academic year:', error);
    res.status(500).json({
      success: false,
      error: 'יצירת שנת הלימוד נכשלה',
    });
  }
});

router.put('/:id', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const existingYear = await getAcademicYearById(db, id);

    if (!existingYear) {
      return res.status(404).json({
        success: false,
        error: 'שנת הלימוד לא נמצאה',
      });
    }

    const updates: Record<string, unknown> = {};

    if (req.body?.year_name !== undefined) {
      const nextName = String(req.body.year_name).trim();
      if (!nextName) {
        return res.status(400).json({
          success: false,
          error: 'שם שנת הלימודים לא יכול להיות ריק',
        });
      }

      const duplicateYear = await db('academic_years')
        .whereRaw('LOWER(year_name) = LOWER(?)', [nextName])
        .whereNot({ id })
        .first();

      if (duplicateYear) {
        return res.status(400).json({
          success: false,
          error: 'כבר קיימת שנת לימוד בשם הזה',
        });
      }

      updates.year_name = nextName;
    }

    if (req.body?.start_date !== undefined) {
      const normalizedStartDate = formatAcademicYearDate(req.body.start_date);
      if (!normalizedStartDate) {
        return res.status(400).json({
          success: false,
          error: 'הוזן start_date לא תקין',
        });
      }
      updates.start_date = normalizedStartDate;
    }

    if (req.body?.end_date !== undefined) {
      const normalizedEndDate = formatAcademicYearDate(req.body.end_date);
      if (!normalizedEndDate) {
        return res.status(400).json({
          success: false,
          error: 'הוזן end_date לא תקין',
        });
      }
      updates.end_date = normalizedEndDate;
    }

    if (req.body?.is_archived !== undefined) {
      updates.is_archived = Boolean(req.body.is_archived);
    }

    const nextStartDate = String(updates.start_date || formatAcademicYearDate(existingYear.start_date));
    const nextEndDate = String(updates.end_date || formatAcademicYearDate(existingYear.end_date));

    if (nextStartDate > nextEndDate) {
      return res.status(400).json({
        success: false,
        error: 'תאריך ההתחלה חייב להיות מוקדם מתאריך הסיום',
      });
    }

    const [updatedYear] = await db('academic_years')
      .where({ id })
      .update({
        ...updates,
        updated_at: db.fn.now(),
      })
      .returning('*');

    res.json({
      success: true,
      data: {
        academic_year: serializeAcademicYear(updatedYear),
      },
    });
  } catch (error) {
    logger.error('Error updating academic year:', error);
    res.status(500).json({
      success: false,
      error: 'עדכון שנת הלימוד נכשל',
    });
  }
});

router.post('/:id/activate', authMiddleware, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    let activatedYear: any = null;

    await db.transaction(async (trx) => {
      const targetYear = await getAcademicYearById(trx, id);

      if (!targetYear) {
        throw new Error('ACADEMIC_YEAR_NOT_FOUND');
      }

      if (targetYear.is_archived) {
        throw new Error('ACADEMIC_YEAR_ARCHIVED');
      }

      const currentActiveYear = await getActiveAcademicYear(trx);
      const targetYearInitialized = await isAcademicYearInitialized(trx, targetYear);

      if (currentActiveYear && currentActiveYear.id !== targetYear.id && !targetYearInitialized) {
        await cloneAcademicYearBaseData({
          trx,
          sourceYear: currentActiveYear,
          targetYear,
        });
      }

      await trx('academic_years').update({
        is_active: false,
        updated_at: trx.fn.now(),
      });

      [activatedYear] = await trx('academic_years')
        .where({ id: targetYear.id })
        .update({
          is_active: true,
          is_archived: false,
          updated_at: trx.fn.now(),
        })
        .returning('*');
    });

    res.json({
      success: true,
      data: {
        academic_year: serializeAcademicYear(activatedYear),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ACADEMIC_YEAR_NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: 'שנת הלימוד לא נמצאה',
      });
    }

    if (error instanceof Error && error.message === 'ACADEMIC_YEAR_ARCHIVED') {
      return res.status(400).json({
        success: false,
        error: 'לא ניתן להפעיל שנת לימוד בארכיון',
      });
    }

    logger.error('Error activating academic year:', error);
    res.status(500).json({
      success: false,
      error: 'הפעלת שנת הלימוד נכשלה',
    });
  }
});

export default router;
