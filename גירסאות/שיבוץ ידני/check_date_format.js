const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_apHqAdu3Uk1G@ep-small-sky-agb0vyap-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkDateFormat() {
  // Check the exact format of dates for room 302
  const result = await pool.query(`
    SELECT id, room_id, date, start_time, end_time, activity_type, is_manual, status
    FROM assignments 
    WHERE room_id = '938712da-9eaf-46d6-9c97-f537fd3e8fb1'
  `);
  
  console.log('Room 302 assignments with date types:');
  result.rows.forEach(row => {
    console.log(`  Date: ${row.date} (type: ${typeof row.date})`);
    console.log(`  Date as string: ${typeof row.date === 'string' ? row.date : row.date.toISOString()}`);
    console.log(`  Date split: ${typeof row.date === 'string' ? row.date.split('T')[0] : row.date.toISOString().split('T')[0]}`);
    console.log('---');
  });
  
  // Test the filtering logic
  const startDate = new Date('2026-02-22');
  const endDate = new Date('2026-02-28');
  
  console.log('\nTesting date filtering:');
  console.log('Start date:', startDate);
  console.log('End date:', endDate);
  
  result.rows.forEach(row => {
    const assignmentDate = new Date(row.date);
    const isInDateRange = assignmentDate >= startDate && assignmentDate <= endDate;
    console.log(`Assignment ${row.id}: ${row.date} -> ${assignmentDate} in range: ${isInDateRange}`);
  });
  
  await pool.end();
}

checkDateFormat().catch(console.error);
