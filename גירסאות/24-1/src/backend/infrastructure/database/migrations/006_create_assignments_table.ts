import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enum('type', ['permanent', 'temporary', 'one_time']).notNullable();
    
    // Polymorphic relationship - what is being assigned
    table.enum('assignable_type', ['homeroom', 'study_group', 'meeting', 'event', 'PE', 'didactics', 'exam_makeup']).notNullable();
    table.uuid('assignable_id').notNullable();
    
    // Where
    table.uuid('room_id').notNullable().references('id').inTable('rooms').onDelete('RESTRICT');
    
    // When
    table.date('start_date').notNullable();
    table.date('end_date').nullable(); // null for permanent
    table.integer('week_count').nullable(); // for temporary
    table.date('specific_date').nullable(); // for one-time
    
    table.text('days_of_week').notNullable(); // JSON string array: ['sunday', 'monday', ...]
    table.jsonb('time_slots').notNullable(); // Array of time slots
    
    // Activity type for reporting
    table.enum('activity_type', ['didactics', 'exam_makeup', 'discussion', 'topics', 'insights', 'camp_prep', 'tracks', 'personal_meeting', 'event', 'study_group', 'homeroom', 'PE']).notNullable();
    
    // Assignment metadata
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.uuid('modified_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    table.boolean('is_manual').defaultTo(false);
    table.text('override_reason').nullable();
    
    // Status
    table.enum('status', ['active', 'cancelled', 'completed', 'conflict']).defaultTo('active');
    table.text('conflicts_with').nullable(); // JSON string array of UUIDs
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['type']);
    table.index(['assignable_type', 'assignable_id']);
    table.index(['room_id']);
    table.index(['start_date', 'end_date']);
    table.index(['activity_type']);
    table.index(['status']);
    table.index(['created_by']);
    
    // Unique constraint to prevent double booking
    table.unique(['room_id', 'start_date', 'end_date', 'days_of_week', 'time_slots']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('assignments');
}
