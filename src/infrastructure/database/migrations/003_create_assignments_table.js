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
    table.date('specific_date');
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
    
    table.foreign('room_id').references('id').inTable('rooms');
    table.foreign('created_by').references('id').inTable('users');
    table.foreign('modified_by').references('id').inTable('users');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('assignments');
};
