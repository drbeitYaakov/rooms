exports.up = function(knex) {
  return knex.schema.createTable('rooms', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('room_number').notNullable();
    table.integer('floor').notNullable();
    table.enum('wing', ['old', 'new']).notNullable();
    table.enum('side', ['left', 'right']);
    table.enum('room_type', ['mamad', 'study_group', 'music', 'caravan', 'large_hall', 'library', 'homeroom', 'regular']).notNullable();
    table.boolean('has_projector').defaultTo(false);
    table.boolean('is_small').defaultTo(false);
    table.integer('capacity').defaultTo(30);
    table.enum('priority', ['low', 'normal', 'high']).defaultTo('normal');
    table.jsonb('reserved_for');
    table.string('grade_level');
    table.text('notes');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.timestamp('deleted_at');
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('rooms');
};
