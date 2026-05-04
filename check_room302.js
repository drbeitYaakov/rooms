const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_apHqAdu3Uk1G@ep-small-sky-agb0vyap-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkRoom302() {
  // Check all assignments for room 302
  const allAssignments = await pool.query(`
    SELECT id, room_id, date, start_time, end_time, activity_type, is_manual, status
    FROM assignments 
    WHERE room_id = '938712da-9eaf-46d6-9c97-f537fd3e8fb1'
    ORDER BY date, start_time
  `);
  
  console.log('All Room 302 assignments:', allAssignments.rows.length);
  allAssignments.rows.forEach(row => {
    const manualText = row.is_manual ? '(manual)' : '(default)';
    console.log(`  ${row.date} ${row.start_time}-${row.end_time} ${row.activity_type} ${manualText} [${row.status}]`);
  });
  
  // Check assignments in the date range
  const rangeAssignments = await pool.query(`
    SELECT id, room_id, date, start_time, end_time, activity_type, is_manual, status
    FROM assignments 
    WHERE room_id = '938712da-9eaf-46d6-9c97-f537fd3e8fb1'
    AND date >= '2026-02-22' AND date <= '2026-02-28'
    ORDER BY date, start_time
  `);
  
  console.log('\nRoom 302 assignments in date range:', rangeAssignments.rows.length);
  rangeAssignments.rows.forEach(row => {
    const manualText = row.is_manual ? '(manual)' : '(default)';
    console.log(`  ${row.date} ${row.start_time}-${row.end_time} ${row.activity_type} ${manualText} [${row.status}]`);
  });
  
  await pool.end();
}

checkRoom302().catch(console.error);
