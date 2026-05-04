const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'educational_scheduling',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
});

async function checkRoomTypes() {
  try {
    console.log('=== סוגי חדרים קיימים בבסיס נתונים ===');
    const result = await pool.query('SELECT DISTINCT room_type FROM rooms ORDER BY room_type');
    
    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. "${row.room_type}"`);
    });

    console.log('\n=== דוגמאות חדרים ===');
    const roomsResult = await pool.query('SELECT room_number, room_type FROM rooms ORDER BY room_number LIMIT 15');
    
    roomsResult.rows.forEach(row => {
      console.log(`חדר ${row.room_number} → "${row.room_type}"`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkRoomTypes();
