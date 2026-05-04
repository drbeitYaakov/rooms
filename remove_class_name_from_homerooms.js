const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function removeClassNameFromHomerooms() {
  try {
    // Remove class_name column from homerooms table
    await db.raw(`
      ALTER TABLE homerooms 
      DROP COLUMN IF EXISTS class_name
    `);
    console.log('Removed class_name column from homerooms table');
    
    console.log('Class name field removed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

removeClassNameFromHomerooms();
