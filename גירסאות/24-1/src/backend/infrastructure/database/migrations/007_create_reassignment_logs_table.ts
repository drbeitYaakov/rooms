import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('reassignment_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('assignment_id').notNullable().references('id').inTable('assignments').onDelete('CASCADE');
    
    // Change details
    table.enum('reason', ['didactics', 'event', 'manual', 'conflict_resolution']).notNullable();
    table.uuid('previous_room_id').nullable().references('id').inTable('rooms').onDelete('SET NULL');
    table.uuid('new_room_id').notNullable().references('id').inTable('rooms').onDelete('RESTRICT');
    table.jsonb('previous_time_slot').nullable();
    table.jsonb('new_time_slot').nullable();
    
    // Metadata
    table.uuid('performed_by').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.timestamp('performed_at').defaultTo(knex.fn.now());
    table.specificType('affected_groups', 'uuid[]').nullable();
    table.boolean('notifications_sent').defaultTo(false);
    table.text('notes').nullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['assignment_id']);
    table.index(['reason']);
    table.index(['performed_by']);
    table.index(['performed_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('reassignment_logs');
}
