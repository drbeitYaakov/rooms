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
  'high_school_pe',
  'room_block'
];
const PREVIOUS_ALLOWED_ASSIGNABLE_TYPES = [
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

const buildConstraintSql = (allowedValues: string[]) =>
  `ALTER TABLE assignments ADD CONSTRAINT ${CHECK_CONSTRAINT_NAME} CHECK (assignable_type IN (${allowedValues.map((value) => `'${value}'`).join(', ')}))`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS ${CHECK_CONSTRAINT_NAME}`);
  await knex.raw(buildConstraintSql(NEXT_ALLOWED_ASSIGNABLE_TYPES));
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM assignments WHERE assignable_type = 'room_block'`);
  await knex.raw(`ALTER TABLE assignments DROP CONSTRAINT IF EXISTS ${CHECK_CONSTRAINT_NAME}`);
  await knex.raw(buildConstraintSql(PREVIOUS_ALLOWED_ASSIGNABLE_TYPES));
}
