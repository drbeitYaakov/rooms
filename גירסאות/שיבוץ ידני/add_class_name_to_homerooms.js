const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function addClassNameToHomerooms() {
  try {
    // Add class_name column to homerooms table
    await db.raw(`
      ALTER TABLE homerooms 
      ADD COLUMN class_name VARCHAR(50)
    `);
    console.log('Added class_name column to homerooms table');
    
    // Update existing records with generated class names
    await db.raw(`
      UPDATE homerooms 
      SET class_name = 
        CASE 
          WHEN g.name = 'א' THEN 'כיתה א' || class_number
          WHEN g.name = 'ב' THEN 'כיתה ב' || class_number  
          WHEN g.name = 'ג' THEN 'כיתה ג' || class_number
          WHEN g.name = 'ד' THEN 'כיתה ד' || class_number
          WHEN g.name = 'ה' THEN 'כיתה ה' || class_number
          WHEN g.name = 'ו' THEN 'כיתה ו' || class_number
          ELSE 'כיתה ' || class_number
        END
      FROM grades g 
      WHERE homerooms.grade_id = g.id
    `);
    console.log('Updated existing records with class names');
    
    console.log('Class name field added successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

addClassNameToHomerooms();
