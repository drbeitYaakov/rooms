import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  return knex.schema.createTable('grades', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.enum('level', ['א', 'ב', 'ג', 'ד', 'ה', 'ו']).notNullable();
    table.string('academic_year').notNullable();
    table.timestamps(true, true);
    
    // Unique constraint
    table.unique(['level', 'academic_year']);
    
    // Indexes
    table.index(['level']);
    table.index(['academic_year']);
  });
}

export async function down(knex: Knex): Promise<void> {
  return knex.schema.dropTable('grades');
}
