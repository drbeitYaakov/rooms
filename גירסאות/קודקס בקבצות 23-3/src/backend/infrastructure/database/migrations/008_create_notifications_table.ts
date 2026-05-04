import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('notifications', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enum('type', ['room_usage_alert', 'reassignment', 'conflict', 'event_reminder', 'cleanup_alert']).notNullable();
    table.specificType('recipient_roles', 'text[]').notNullable();
    table.specificType('recipient_ids', 'uuid[]').nullable();
    table.string('title').notNullable();
    table.text('message').notNullable();
    table.jsonb('metadata').nullable();
    
    // Triggers
    table.enum('triggered_by', ['usage_count', 'event', 'manual', 'system']).notNullable();
    table.integer('threshold').nullable();
    
    // Status
    table.boolean('is_read').defaultTo(false);
    table.timestamp('read_at').nullable();
    
    table.timestamps(true, true);
    
    // Indexes
    table.index(['type']);
    table.index(['recipient_roles']);
    table.index(['is_read']);
    table.index(['triggered_by']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('notifications');
}
