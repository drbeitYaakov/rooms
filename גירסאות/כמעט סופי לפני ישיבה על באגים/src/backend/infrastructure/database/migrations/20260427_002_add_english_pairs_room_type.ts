import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RoomType') THEN
        ALTER TYPE "RoomType" ADD VALUE IF NOT EXISTS 'ENGLISH_PAIRS';
      END IF;
    END
    $$;
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // PostgreSQL enum values are not safely removable in a simple rollback.
}
