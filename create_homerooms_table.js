const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function createHomeroomsTable() {
  try {
    // Create homerooms table without foreign key first
    await db.raw(`
      CREATE TABLE IF NOT EXISTS homerooms (
        id SERIAL PRIMARY KEY,
        room_id INTEGER,
        grade_id INTEGER,
        class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 7),
        teacher_id INTEGER,
        max_students INTEGER DEFAULT 40,
        current_students INTEGER DEFAULT 0,
        school_year VARCHAR(10) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Homerooms table created without FK');

    // Add foreign key constraint
    await db.raw(`
      ALTER TABLE homerooms 
      ADD CONSTRAINT homerooms_grade_id_fkey 
      FOREIGN KEY (grade_id) REFERENCES grades(id)
    `);
    console.log('Foreign key constraint added');

    console.log('Homerooms table completed successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

createHomeroomsTable();
