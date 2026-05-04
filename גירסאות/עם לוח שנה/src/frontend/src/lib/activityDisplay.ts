const ACTIVITY_LABELS: Record<string, string> = {
  study_group: "הקבצה",
  regular_class: "שיעור רגיל",
  meeting: "מפגש",
  party: "מסיבה",
  event: "מפגש / אירוע",
  didactics: "דידקטיקה",
  exam_makeup: "השלמת מבחנים",
  one_on_one: "אחד על אחד",
  personal_meeting: "אחד על אחד",
  discussion: "שיח",
  topics: "סוגיות",
  discussion_topics: "שיח / סוגיות",
  high_school_pe: "התעמלות תיכון",
  PE: "התעמלות",
  homeroom: "כיתת אם",
  לימודים: "כיתת אם",
  exam: "מבחן",
};

const ACTIVITY_COLORS: Record<string, string> = {
  study_group: "border-sky-200 bg-sky-50 text-sky-800",
  regular_class: "border-emerald-200 bg-emerald-50 text-emerald-800",
  meeting: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800",
  party: "border-pink-200 bg-pink-50 text-pink-800",
  event: "border-amber-200 bg-amber-50 text-amber-800",
  didactics: "border-violet-200 bg-violet-50 text-violet-800",
  exam_makeup: "border-rose-200 bg-rose-50 text-rose-800",
  one_on_one: "border-cyan-200 bg-cyan-50 text-cyan-800",
  personal_meeting: "border-cyan-200 bg-cyan-50 text-cyan-800",
  discussion: "border-teal-200 bg-teal-50 text-teal-800",
  topics: "border-lime-200 bg-lime-50 text-lime-800",
  discussion_topics: "border-teal-200 bg-teal-50 text-teal-800",
  high_school_pe: "border-orange-200 bg-orange-50 text-orange-800",
  PE: "border-orange-200 bg-orange-50 text-orange-800",
  homeroom: "border-indigo-200 bg-indigo-50 text-indigo-800",
  לימודים: "border-indigo-200 bg-indigo-50 text-indigo-800",
  exam: "border-rose-200 bg-rose-50 text-rose-800",
};

export const getActivityTypeText = (type?: string | null): string => {
  const normalized = String(type || "").trim();
  return ACTIVITY_LABELS[normalized] || normalized;
};

export const getActivityTypeColorClass = (type?: string | null, fallback = "border-slate-200 bg-slate-100 text-slate-700"): string => {
  const normalized = String(type || "").trim();
  return ACTIVITY_COLORS[normalized] || fallback;
};
