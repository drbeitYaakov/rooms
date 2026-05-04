const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function checkAvailableRooms() {
  try {
    // Get all grades
    const grades = await db.raw('SELECT * FROM grades');
    console.log('Grades:');
    grades.rows.forEach(grade => {
      console.log(`- ID: ${grade.id}, Name: ${grade.name}, Level: ${grade.level}`);
    });
    
    console.log('\nAll rooms:');
    const rooms = await db.raw('SELECT id, room_number, room_type, capacity, is_active FROM rooms ORDER BY room_number');
    rooms.rows.forEach(room => {
      console.log(`- ${room.room_number}: ${room.room_type} (capacity: ${room.capacity}, active: ${room.is_active})`);
    });
    
    console.log('\nCurrent homerooms:');
    const homerooms = await db.raw(`
      SELECT h.id, h.grade_id, h.room_id, g.name as grade_name, r.room_number, r.room_type
      FROM homerooms h
      JOIN grades g ON h.grade_id = g.id
      JOIN rooms r ON h.room_id = r.id
    `);
    homerooms.rows.forEach(h => {
      console.log(`- ${h.grade_name}: ${h.room_number} (${h.room_type})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAvailableRooms();
