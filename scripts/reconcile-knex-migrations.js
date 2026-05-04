require('dotenv').config();

const knexFactory = require('knex');
const knexConfig = require('../knexfile');

const LEGACY_MIGRATIONS = [
  '001_create_users_table.js',
  '002_create_rooms_table.js',
  '003_create_assignments_table.js',
  '007_add_is_active_to_rooms.js',
  '008_fix_missing_columns.js',
  '009_fix_rooms_schema.js',
  '010_fix_grades_schema.js',
  '011_fix_users_schema.js',
  '012_create_room_requests_table.js',
  '013_create_assignments_table.js',
  '014_create_study_group_grade_groups_table.js',
];

const BASELINE_MIGRATION = '20260413_001_create_live_schema_baseline.ts';

async function main() {
  const environment = process.env.NODE_ENV || 'development';
  const knex = knexFactory(knexConfig[environment]);

  try {
    const appliedMigrations = await knex('knex_migrations')
      .select('name', 'batch')
      .orderBy('id', 'asc');

    const appliedNames = new Set(appliedMigrations.map((row) => row.name));
    const hasLegacyHistory = LEGACY_MIGRATIONS.some((name) => appliedNames.has(name));
    const hasBaselineRecorded = appliedNames.has(BASELINE_MIGRATION);

    if (!hasLegacyHistory) {
      console.log('No legacy migration history found. No reconciliation needed.');
      return;
    }

    if (hasBaselineRecorded) {
      console.log('Baseline migration is already recorded. No reconciliation needed.');
      return;
    }

    const nextBatch = appliedMigrations.reduce((max, row) => Math.max(max, Number(row.batch || 0)), 0) + 1;

    await knex('knex_migrations').insert({
      name: BASELINE_MIGRATION,
      batch: nextBatch,
      migration_time: knex.fn.now(),
    });

    console.log(`Recorded baseline migration "${BASELINE_MIGRATION}" in batch ${nextBatch}.`);
    console.log('You can now rerun: npm run db:migrate');
  } finally {
    await knex.destroy();
  }
}

main().catch((error) => {
  console.error('Failed to reconcile migration history:', error);
  process.exitCode = 1;
});
