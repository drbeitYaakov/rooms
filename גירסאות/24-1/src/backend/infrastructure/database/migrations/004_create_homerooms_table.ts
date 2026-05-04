import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('homerooms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('grade_id').notNullable().references('id').inTable('grades').onDelete('CASCADE');
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('RESTRICT');
    table.integer('class_number').notNullable().checkBetween([1, 7]);
    table.integer('student_count').notNullable().checkPositive();
    table.time('default_start_time').defaultTo('08:00:00');
    table.time('default_end_time').defaultTo('14:45:00');
    table.time('friday_end_time').defaultTo('12:00:00');
    table.jsonb('grade_specific_rules').nullable();
    table.timestamps(true, true);
    
    // Unique constraint
    table.unique(['grade_id', 'class_number']);
    
    // Indexes
    table.index(['grade_id']);
    table.index(['room_id']);
    table.index(['class_number']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('homerooms');
}
