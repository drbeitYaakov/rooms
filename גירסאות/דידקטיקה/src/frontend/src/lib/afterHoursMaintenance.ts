const MAINTENANCE_ALERT_THRESHOLD = "16:00";
const AUDITORIUM_MAINTENANCE_ACTIVITY_TYPES = ["didactics", "event"] as const;

export const MAINTENANCE_AFTER_HOURS_MESSAGE =
  "יש לעדכן את אחראי התחזוקה על החדר שבשימוש.";

const isValidTime = (value: string) => /^\d{2}:\d{2}$/.test(value);

export const isAfterHoursAssignment = (startTime?: string, endTime?: string) => {
  if (!startTime || !endTime || !isValidTime(startTime) || !isValidTime(endTime)) {
    return false;
  }

  return startTime >= MAINTENANCE_ALERT_THRESHOLD || endTime > MAINTENANCE_ALERT_THRESHOLD;
};

export const hasAfterHoursSchedule = (
  schedule: Array<{ start_time?: string; end_time?: string }>
) => schedule.some((entry) => isAfterHoursAssignment(entry.start_time, entry.end_time));

export const isAuditoriumMaintenanceActivity = (activityType?: string) =>
  AUDITORIUM_MAINTENANCE_ACTIVITY_TYPES.includes(
    String(activityType || "").trim().toLowerCase() as (typeof AUDITORIUM_MAINTENANCE_ACTIVITY_TYPES)[number]
  );

export const shouldShowMaintenanceAlert = (params: {
  startTime?: string;
  endTime?: string;
  isAuditorium?: boolean;
  activityType?: string;
}) =>
  (params.isAuditorium && isAuditoriumMaintenanceActivity(params.activityType)) ||
  isAfterHoursAssignment(params.startTime, params.endTime);
