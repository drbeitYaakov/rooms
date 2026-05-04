import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.enum('action', ['create', 'update', 'delete', 'override']).notNullable();
    table.enum('entity_type', ['assignment', 'room', 'group', 'rule', 'user', 'grade', 'homeroom']).notNullable();
    table.uuid('entity_id').notNullable();
    table.jsonb('changes').notNullable(); // { before: {}, after: {} }
    table.string('ip_address').nullable();
    table.text('user_agent').nullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now());
    
    // Indexes
    table.index(['user_id']);
    table.index(['action']);
    table.index(['entity_type']);
    table.index(['timestamp']);
    table.index(['entity_type', 'entity_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('audit_logs');
}
