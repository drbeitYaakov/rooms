import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('study_group_grade_groups', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable();
    table.string('grade_level').notNullable();
    table.integer('group_number').notNullable();
    table.jsonb('weekly_schedule').notNullable().defaultTo('[]');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());

    table.unique(['year_id', 'grade_level', 'group_number']);
    table.index(['year_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('study_group_grade_groups');
}
