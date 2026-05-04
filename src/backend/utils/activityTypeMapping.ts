export const ROOM_REQUEST_ACTIVITY_TYPES = [
  'didactics',
  'exam_makeup',
  'one_on_one',
  'discussion',
  'topics',
  'study_group',
  'event',
  'high_school_pe'
] as const;

export const LEGACY_ACTIVITY_TYPE_ALIASES = {
  meeting: 'event',
  party: 'event',
  personal_meeting: 'one_on_one'
} as const;

export const LEGACY_MANUAL_ACTIVITY_TYPES = [
  'homeroom',
  'PE',
  'insights',
  'camp_prep',
  'tracks'
] as const;

export const MANUAL_ACTIVITY_TYPES = [
  ...ROOM_REQUEST_ACTIVITY_TYPES,
  ...Object.keys(LEGACY_ACTIVITY_TYPE_ALIASES),
  ...LEGACY_MANUAL_ACTIVITY_TYPES
] as const;

export type RoomRequestActivityType = typeof ROOM_REQUEST_ACTIVITY_TYPES[number];
export type ManualActivityType = typeof MANUAL_ACTIVITY_TYPES[number];

const toNormalizedActivityValue = (value?: string | null): string => (value || '').trim().toLowerCase();

export const normalizeActivityTypeForPersistence = (value?: string | null): string => {
  const normalized = toNormalizedActivityValue(value);

  if (!normalized) {
    return '';
  }

  if (normalized in LEGACY_ACTIVITY_TYPE_ALIASES) {
    return LEGACY_ACTIVITY_TYPE_ALIASES[normalized as keyof typeof LEGACY_ACTIVITY_TYPE_ALIASES];
  }

  return normalized;
};

export const mapActivityTypeToAssignableType = (value?: string | null): string => {
  const normalized = normalizeActivityTypeForPersistence(value);

  switch (normalized) {
    case 'didactics':
      return 'didactics';
    case 'exam_makeup':
      return 'exam_makeup';
    case 'one_on_one':
      return 'one_on_one';
    case 'discussion':
    case 'topics':
      return 'discussion_topics';
    case 'study_group':
      return 'study_group';
    case 'high_school_pe':
      return 'high_school_pe';
    case 'homeroom':
      return 'homeroom';
    case 'pe':
      return 'PE';
    case 'insights':
    case 'camp_prep':
    case 'tracks':
    case 'event':
    default:
      return 'event';
  }
};

export const isValidManualActivityType = (value?: string | null): boolean => {
  const normalized = normalizeActivityTypeForPersistence(value);
  const normalizedLegacyManualTypes = (LEGACY_MANUAL_ACTIVITY_TYPES as readonly string[]).map((entry) => entry.toLowerCase());

  if (!normalized) {
    return false;
  }

  return (ROOM_REQUEST_ACTIVITY_TYPES as readonly string[]).includes(normalized)
    || (Object.keys(LEGACY_ACTIVITY_TYPE_ALIASES) as readonly string[]).includes(toNormalizedActivityValue(value))
    || normalizedLegacyManualTypes.includes(normalized);
};
