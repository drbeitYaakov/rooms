const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function checkHomeroomsSchema() {
  try {
    console.log('Checking homerooms table schema...');
    const result = await db.raw(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'homerooms' 
      ORDER BY ordinal_position
    `);
    
    console.log('Homerooms table columns:');
    result.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkHomeroomsSchema();
