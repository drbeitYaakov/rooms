/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('assignments', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enum('type', ['permanent', 'temporary', 'one_time']).notNullable();
    table.enum('assignable_type', ['homeroom', 'study_group', 'meeting', 'event', 'PE', 'didactics', 'exam_makeup']).notNullable();
    table.string('assignable_id').notNullable();
    table.uuid('room_id').notNullable();
    table.date('start_date').notNullable();
    table.date('end_date');
    table.integer('week_count');
    table.date('specific_date').nullable();
    table.jsonb('days_of_week').notNullable();
    table.jsonb('time_slots').notNullable();
    table.string('activity_type').notNullable();
    table.uuid('created_by').notNullable();
    table.uuid('modified_by');
    table.boolean('is_manual').defaultTo(false);
    table.text('override_reason');
    table.enum('status', ['active', 'cancelled', 'completed', 'conflict']).defaultTo('active');
    table.jsonb('conflicts_with');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    // Add simple columns for easier querying
    table.date('date').nullable();
    table.time('start_time').nullable();
    table.time('end_time').nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('assignments');
};
