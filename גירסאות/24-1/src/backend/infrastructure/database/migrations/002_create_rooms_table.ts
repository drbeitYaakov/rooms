import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('rooms', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('room_number').unique().notNullable();
    table.integer('floor').notNullable();
    table.enum('wing', ['old', 'new']).notNullable();
    table.enum('side', ['left', 'right']).nullable();
    table.enum('room_type', [
      'mamad', 'study_group', 'music', 'caravan', 
      'large_hall', 'library', 'homeroom', 'regular'
    ]).notNullable();
    table.boolean('has_projector').defaultTo(false);
    table.boolean('is_small').defaultTo(false);
    table.integer('capacity').notNullable();
    table.enum('priority', ['low', 'normal', 'high']).defaultTo('normal');
    table.specificType('reserved_for', 'text[]').nullable();
    table.enum('grade_level', ['א', 'ב', 'ג', 'ד', 'ה', 'ו']).nullable();
    table.text('notes').nullable();
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    // Indexes
    table.index(['room_number']);
    table.index(['room_type']);
    table.index(['floor']);
    table.index(['wing']);
    table.index(['priority']);
    table.index(['is_active']);
    table.index(['grade_level']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('rooms');
}
