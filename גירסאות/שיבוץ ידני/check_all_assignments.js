const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/educational_scheduling'
});

async function checkAllAssignments() {
  try {
    console.log('🔍 Checking ALL active assignments in the system...\n');
    
    // Get all active assignments
    const allAssignments = await pool.query(`
      SELECT a.id, a.room_id, r.number as room_number, a.date, a.start_time, a.end_time, 
             a.activity_type, a.is_manual, a.status, a.study_group_name, a.grade
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'active'
      ORDER BY a.date, a.start_time, r.number
    `);
    
    console.log(`📊 Total active assignments: ${allAssignments.rows.length}\n`);
    
    // Group by date
    const assignmentsByDate = {};
    allAssignments.rows.forEach(assignment => {
      const date = assignment.date;
      if (!assignmentsByDate[date]) {
        assignmentsByDate[date] = [];
      }
      assignmentsByDate[date].push(assignment);
    });
    
    // Display by date
    Object.keys(assignmentsByDate).sort().forEach(date => {
      console.log(`📅 Date: ${date}`);
      assignmentsByDate[date].forEach(assignment => {
        const manualText = assignment.is_manual ? '(manual)' : '(default)';
        const roomText = assignment.room_number || assignment.room_id.substring(0, 8);
        console.log(`  🏠 Room ${roomText}: ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
      });
      console.log('');
    });
    
    // Check specifically for Friday assignments (since you mentioned Friday)
    console.log('🔍 Checking Friday assignments specifically...');
    const fridayAssignments = await pool.query(`
      SELECT a.id, a.room_id, r.number as room_number, a.date, a.start_time, a.end_time, 
             a.activity_type, a.is_manual, a.status, a.study_group_name, a.grade
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'active'
      AND EXTRACT(DOW FROM a.date) = 5  -- Friday
      ORDER BY a.date, a.start_time, r.number
    `);
    
    console.log(`📊 Total Friday assignments: ${fridayAssignments.rows.length}\n`);
    fridayAssignments.rows.forEach(assignment => {
      const manualText = assignment.is_manual ? '(manual)' : '(default)';
      const roomText = assignment.room_number || assignment.room_id.substring(0, 8);
      console.log(`  🏠 Room ${roomText}: ${assignment.date} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
    });
    
    // Check assignments for this week (Feb 22-28)
    console.log('\n🔍 Checking assignments for this week (Feb 22-28)...');
    const weekAssignments = await pool.query(`
      SELECT a.id, a.room_id, r.number as room_number, a.date, a.start_time, a.end_time, 
             a.activity_type, a.is_manual, a.status, a.study_group_name, a.grade
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'active'
      AND a.date >= '2026-02-22' AND a.date <= '2026-02-28'
      ORDER BY a.date, a.start_time, r.number
    `);
    
    console.log(`📊 Total assignments this week: ${weekAssignments.rows.length}\n`);
    weekAssignments.rows.forEach(assignment => {
      const manualText = assignment.is_manual ? '(manual)' : '(default)';
      const roomText = assignment.room_number || assignment.room_id.substring(0, 8);
      console.log(`  🏠 Room ${roomText}: ${assignment.date} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
    });
    
    // Check for any assignments that might have issues
    console.log('\n🔍 Checking for potential issues...');
    
    // Check assignments with end_time before start_time
    const timeIssues = await pool.query(`
      SELECT id, room_id, date, start_time, end_time, activity_type
      FROM assignments
      WHERE status = 'active'
      AND (
        (EXTRACT(HOUR FROM end_time) * 60 + EXTRACT(MINUTE FROM end_time)) <= 
        (EXTRACT(HOUR FROM start_time) * 60 + EXTRACT(MINUTE FROM start_time))
      )
    `);
    
    if (timeIssues.rows.length > 0) {
      console.log(`⚠️  Found ${timeIssues.rows.length} assignments with end_time <= start_time:`);
      timeIssues.rows.forEach(assignment => {
        console.log(`  🚨 Assignment ${assignment.id}: ${assignment.date} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type}`);
      });
    } else {
      console.log('✅ No time issues found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAllAssignments();
