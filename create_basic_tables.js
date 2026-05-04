const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function createBasicTables() {
  try {
    // Create grades table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS grades (
        id SERIAL PRIMARY KEY,
        name VARCHAR(1) NOT NULL UNIQUE CHECK (name IN ('א', 'ב', 'ג', 'ד', 'ה', 'ו')),
        coordinator_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Grades table created');

    // Create homerooms table
    await db.raw(`
      CREATE TABLE IF NOT EXISTS homerooms (
        id SERIAL PRIMARY KEY,
        room_id INTEGER,
        grade_id INTEGER REFERENCES grades(id),
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
    console.log('Homerooms table created');

    // Insert basic grades
    await db.raw("INSERT INTO grades (name) VALUES ('א'), ('ב'), ('ג'), ('ד'), ('ה'), ('ו') ON CONFLICT (name) DO NOTHING");
    console.log('Grades inserted');

    console.log('Basic tables created successfully');
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

createBasicTables();
