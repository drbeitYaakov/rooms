import { Knex } from 'knex';

const CHECK_CONSTRAINT_NAME = 'assignments_assignable_type_check';
const NEXT_ALLOWED_ASSIGNABLE_TYPES = [
  'homeroom',
  'study_group',
  'event',
  'PE',
  'didactics',
  'exam_makeup',
  'one_on_one',
  'discussion_topics',
  'high_school_pe'
];
const PREVIOUS_ALLOWED_ASSIGNABLE_TYPES = [
  'homeroom',
  'study_group',
  'meeting',
  'event',
  'PE',
  'didactics',
  'exam_makeup'
];

const buildConstraintSql = (allowedValues: string[]) =>
  `ALTER TABLE assignments ADD CONSTRAINT ${CHECK_CONSTRAINT_NAME} CHECK (assignable_type IN (${allowedValues.map((value) => `'${value}'`).join(', ')}))`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS ${CHECK_CONSTRAINT_NAME}`);

  // Normalize legacy rows before enforcing the newer assignable_type domain.
  await knex.raw(`
    UPDATE assignments
    SET assignable_type = CASE
      WHEN LOWER(COALESCE(assignable_type, '')) = 'meeting' THEN
        CASE
          WHEN LOWER(COALESCE(activity_type, '')) IN ('personal_meeting', 'one_on_one') THEN 'one_on_one'
          WHEN LOWER(COALESCE(activity_type, '')) IN ('discussion', 'topics') THEN 'discussion_topics'
          WHEN LOWER(COALESCE(activity_type, '')) = 'high_school_pe' THEN 'high_school_pe'
          WHEN LOWER(COALESCE(activity_type, '')) = 'study_group' THEN 'study_group'
          WHEN LOWER(COALESCE(activity_type, '')) = 'didactics' THEN 'didactics'
          WHEN LOWER(COALESCE(activity_type, '')) = 'exam_makeup' THEN 'exam_makeup'
          WHEN LOWER(COALESCE(activity_type, '')) = 'homeroom' THEN 'homeroom'
          WHEN LOWER(COALESCE(activity_type, '')) = 'pe' THEN 'PE'
          ELSE 'event'
        END
      WHEN LOWER(COALESCE(assignable_type, '')) IN ('personal_meeting', 'one_on_one') THEN 'one_on_one'
      WHEN LOWER(COALESCE(assignable_type, '')) IN ('discussion', 'topics') THEN 'discussion_topics'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'high_school_pe' THEN 'high_school_pe'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'study_group' THEN 'study_group'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'didactics' THEN 'didactics'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'exam_makeup' THEN 'exam_makeup'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'homeroom' THEN 'homeroom'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'pe' THEN 'PE'
      WHEN LOWER(COALESCE(assignable_type, '')) = 'event' THEN 'event'
      ELSE assignable_type
    END
    WHERE COALESCE(assignable_type, '') NOT IN ('homeroom', 'study_group', 'event', 'PE', 'didactics', 'exam_makeup', 'one_on_one', 'discussion_topics', 'high_school_pe')
       OR LOWER(COALESCE(assignable_type, '')) = 'meeting'
  `);

  await knex.raw(buildConstraintSql(NEXT_ALLOWED_ASSIGNABLE_TYPES));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS ${CHECK_CONSTRAINT_NAME}`);
  await knex.raw(buildConstraintSql(PREVIOUS_ALLOWED_ASSIGNABLE_TYPES));
}
