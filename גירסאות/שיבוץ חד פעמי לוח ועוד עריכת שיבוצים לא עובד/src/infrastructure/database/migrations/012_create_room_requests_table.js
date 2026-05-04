/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('room_requests', function(table) {
    table.increments('id').primary();
    table.uuid('requester_id').notNullable();
    table.uuid('requested_room_id').nullable();
    table.string('activity_type').notNullable(); // 'lesson', 'study_group', 'meeting', 'exam', 'event'
    table.string('grade').nullable(); // 'א', 'ב', 'ג', 'ד', 'ה', 'ו'
    table.integer('student_count').notNullable();
    table.date('date').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.text('special_requirements').nullable();
    table.string('status').defaultTo('pending'); // 'pending', 'approved', 'rejected'
    table.uuid('approved_room_id').nullable();
    table.text('notes').nullable();
    table.uuid('updated_by').nullable();
    table.timestamps(true, true);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('room_requests');
};
