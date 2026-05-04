export type SchedulingActivityOption = {
  value: string;
  label: string;
};

export const BASE_ROOM_REQUEST_ACTIVITY_OPTIONS: SchedulingActivityOption[] = [
  { value: "didactics", label: "דידקטיקה" },
  { value: "exam_makeup", label: "השלמת מבחנים" },
  { value: "one_on_one", label: "אחד על אחד" },
  { value: "discussion", label: "שיח" },
  { value: "topics", label: "סוגיות" },
  { value: "study_group", label: "הקבצה" },
  { value: "event", label: "מפגש / מסיבה / אירוע" },
];

export const HIGH_SCHOOL_PE_ACTIVITY_OPTION: SchedulingActivityOption = {
  value: "high_school_pe",
  label: "התעמלות תיכון",
};

export const RECURRING_ROOM_REQUEST_ACTIVITY_OPTIONS: SchedulingActivityOption[] = [
  ...BASE_ROOM_REQUEST_ACTIVITY_OPTIONS,
  HIGH_SCHOOL_PE_ACTIVITY_OPTION,
];

export const MANUAL_AUDITORIUM_ACTIVITY_OPTIONS: SchedulingActivityOption[] = [
  { value: "didactics", label: "הרצאת שכבה" },
  { value: "event", label: "אירוע באישור הנהלה" },
];
