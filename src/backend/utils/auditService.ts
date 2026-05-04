import { randomUUID } from 'crypto';
import { Request } from 'express';
import { db } from '../config/database';
import logger from './logger';
import { getActiveAcademicYear } from './academicYears';

type AuditRecordInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  req?: Request;
  overrideApprovedBy?: string | null;
};

const normalizeAction = (action: string) => action.trim().toUpperCase();

const getRequestIpAddress = (req?: Request): string | null => {
  if (!req) {
    return null;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.ip || null;
};

const resolveAuditYearId = async (): Promise<string | null> => {
  const activeYear = await getActiveAcademicYear(db);
  if (activeYear?.id) {
    return activeYear.id;
  }

  const firstYear = await db('academic_years')
    .orderBy('created_at', 'asc')
    .first('id');

  return firstYear?.id ?? null;
};

export const recordAuditEvent = async (input: AuditRecordInput): Promise<void> => {
  try {
    if (!input.userId) {
      logger.warn('[AUDIT] Skipping DB audit event because userId is missing', {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
      });
      return;
    }

    const yearId = await resolveAuditYearId();
    if (!yearId) {
      logger.warn('[AUDIT] Skipping DB audit event because academic year is missing', {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
      });
      return;
    }

    await db('audit_logs').insert({
      id: randomUUID(),
      year_id: yearId,
      user_id: input.userId,
      action: normalizeAction(input.action),
      entity_type: input.entityType,
      entity_id: input.entityId,
      old_value: input.oldValue === undefined ? null : input.oldValue,
      new_value: input.newValue === undefined ? null : input.newValue,
      override_approved_by: input.overrideApprovedBy ?? null,
      ip_address: getRequestIpAddress(input.req),
      created_at: db.fn.now(),
    });
  } catch (error) {
    logger.error('Failed to persist audit event:', error);
  }
};
