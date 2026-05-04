const { Pool } = require('pg');

async function checkRecentAssignments() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/educational_scheduling'
  });

  try {
    console.log('🔍 Checking recent assignments for room 302...');
    
    // Get all assignments for room 302
    const room302Assignments = await pool.query(`
      SELECT * FROM assignments 
      WHERE room_id = '938712da-9eaf-46d6-9c97-f537fd3e8fb1'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log(`\n📊 Found ${room302Assignments.rows.length} assignments for room 302:`);
    room302Assignments.rows.forEach((assignment, index) => {
      console.log(`${index + 1}. ID: ${assignment.id}`);
      console.log(`   Date: ${assignment.specific_date || assignment.start_date || assignment.date}`);
      console.log(`   Time: ${JSON.stringify(assignment.time_slots)}`);
      console.log(`   Type: ${assignment.activity_type}`);
      console.log(`   Manual: ${assignment.is_manual}`);
      console.log(`   Status: ${assignment.status}`);
      console.log(`   Created: ${assignment.created_at}`);
      console.log('');
    });
    
    // Get all manual assignments created in the last hour
    const recentManualAssignments = await pool.query(`
      SELECT * FROM assignments 
      WHERE is_manual = true 
      AND created_at > NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
    `);
    
    console.log(`\n🎯 Found ${recentManualAssignments.rows.length} manual assignments in the last hour:`);
    recentManualAssignments.rows.forEach((assignment, index) => {
      console.log(`${index + 1}. Room: ${assignment.room_id}`);
      console.log(`   Date: ${assignment.specific_date || assignment.start_date || assignment.date}`);
      console.log(`   Time: ${JSON.stringify(assignment.time_slots)}`);
      console.log(`   Type: ${assignment.activity_type}`);
      console.log(`   Status: ${assignment.status}`);
      console.log(`   Created: ${assignment.created_at}`);
      console.log('');
    });
    
    // Check if there are any assignments with invalid data
    const invalidAssignments = await pool.query(`
      SELECT id, room_id, is_manual, created_at
      FROM assignments 
      WHERE specific_date IS NULL 
      AND start_date IS NULL 
      AND date IS NULL
      ORDER BY created_at DESC
      LIMIT 5
    `);
    
    if (invalidAssignments.rows.length > 0) {
      console.log(`\n❌ Found ${invalidAssignments.rows.length} assignments with no valid date:`);
      invalidAssignments.rows.forEach((assignment) => {
        console.log(`   ID: ${assignment.id}, Room: ${assignment.room_id}, Manual: ${assignment.is_manual}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking assignments:', error);
  } finally {
    await pool.end();
  }
}

checkRecentAssignments();
