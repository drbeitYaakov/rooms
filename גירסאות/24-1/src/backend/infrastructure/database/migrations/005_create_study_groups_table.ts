import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('study_groups', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('name').notNullable();
    table.uuid('grade_id').notNullable().references('id').inTable('grades').onDelete('CASCADE');
    table.enum('subject', ['math', 'english', 'science', 'other']).notNullable();
    table.integer('student_count').notNullable().checkPositive();
    table.specificType('source_homerooms', 'uuid[]').nullable().references('id').inTable('homerooms');
    table.jsonb('schedule').notNullable(); // Days and time slots
    table.integer('duration_minutes').notNullable().defaultTo(45);
    table.boolean('requires_consecutive').defaultTo(false);
    table.integer('sessions_per_week').defaultTo(1);
    table.uuid('preferred_room_id').nullable().references('id').inTable('rooms').onDelete('SET NULL');
    table.integer('priority').defaultTo(5).checkBetween([1, 10]);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['name']);
    table.index(['grade_id']);
    table.index(['subject']);
    table.index(['priority']);
    table.index(['preferred_room_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('study_groups');
}
