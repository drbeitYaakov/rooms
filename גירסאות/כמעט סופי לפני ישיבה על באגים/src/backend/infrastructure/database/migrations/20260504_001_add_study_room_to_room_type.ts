import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'RoomType'
      ) AND NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'RoomType'
          AND e.enumlabel = 'study_room'
      ) THEN
        ALTER TYPE "RoomType" ADD VALUE 'study_room';
      END IF;
    END
    $$;
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // PostgreSQL enum values are not safely removable in a simple down migration.
}
