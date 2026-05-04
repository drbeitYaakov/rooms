const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/educational_scheduling'
});

async function showAllAssignments() {
  try {
    console.log('🔍 Fetching ALL assignments from database...\n');
    
    // Get ALL assignments with room details
    const result = await pool.query(`
      SELECT 
        a.id,
        a.room_id,
        r.number as room_number,
        a.date,
        a.start_time,
        a.end_time,
        a.activity_type,
        a.is_manual,
        a.status,
        a.study_group_name,
        a.grade
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id = r.id
      ORDER BY a.date, r.number, a.start_time
    `);
    
    console.log(`📊 Found ${result.rows.length} total assignments in database:\n`);
    
    // Group by date for better organization
    const assignmentsByDate = {};
    result.rows.forEach(assignment => {
      const date = assignment.date.toISOString().split('T')[0];
      if (!assignmentsByDate[date]) {
        assignmentsByDate[date] = [];
      }
      assignmentsByDate[date].push(assignment);
    });
    
    // Display by date
    Object.keys(assignmentsByDate).sort().forEach(date => {
      console.log(`📅 === ${date} === (${assignmentsByDate[date].length} assignments)`);
      
      // Group by room
      const assignmentsByRoom = {};
      assignmentsByDate[date].forEach(assignment => {
        const roomNum = assignment.room_number || 'Unknown';
        if (!assignmentsByRoom[roomNum]) {
          assignmentsByRoom[roomNum] = [];
        }
        assignmentsByRoom[roomNum].push(assignment);
      });
      
      Object.keys(assignmentsByRoom).sort().forEach(roomNum => {
        console.log(`\n  🏠 Room ${roomNum}:`);
        assignmentsByRoom[roomNum].forEach(assignment => {
          const manualText = assignment.is_manual ? '✋ MANUAL' : '🤖 DEFAULT';
          const statusText = assignment.status === 'active' ? '✅' : '❌';
          const groupText = assignment.study_group_name ? ` [${assignment.study_group_name}]` : '';
          const gradeText = assignment.grade ? ` (${assignment.grade})` : '';
          
          console.log(`    ${statusText} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type}${groupText}${gradeText} ${manualText}`);
        });
      });
      console.log('');
    });
    
    // Summary statistics
    console.log('📈 === SUMMARY ===');
    const totalAssignments = result.rows.length;
    const activeAssignments = result.rows.filter(a => a.status === 'active').length;
    const manualAssignments = result.rows.filter(a => a.is_manual).length;
    const defaultAssignments = totalAssignments - manualAssignments;
    
    console.log(`Total assignments: ${totalAssignments}`);
    console.log(`Active assignments: ${activeAssignments}`);
    console.log(`Manual assignments: ${manualAssignments}`);
    console.log(`Default assignments: ${defaultAssignments}`);
    
    // Check for time issues
    console.log('\n🐛 === TIME ISSUES ===');
    const timeIssues = result.rows.filter(assignment => {
      const [startHour, startMinute] = assignment.start_time.split(':').map(Number);
      const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;
      
      return endTimeInMinutes <= startTimeInMinutes;
    });
    
    if (timeIssues.length > 0) {
      console.log(`Found ${timeIssues.length} assignments with end_time <= start_time:`);
      timeIssues.forEach(assignment => {
        const roomNum = assignment.room_number || 'Unknown';
        console.log(`  🚨 Room ${roomNum}: ${assignment.date.toISOString().split('T')[0]} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type}`);
      });
    } else {
      console.log('✅ No time issues found');
    }
    
    // Check for Friday assignments specifically
    console.log('\n🔍 === FRIDAY ASSIGNMENTS ===');
    const fridayAssignments = result.rows.filter(assignment => {
      const date = new Date(assignment.date);
      return date.getDay() === 5; // Friday
    });
    
    console.log(`Found ${fridayAssignments.length} assignments on Fridays:`);
    fridayAssignments.forEach(assignment => {
      const roomNum = assignment.room_number || 'Unknown';
      const manualText = assignment.is_manual ? '✋ MANUAL' : '🤖 DEFAULT';
      const dateStr = assignment.date.toISOString().split('T')[0];
      console.log(`  🏠 Room ${roomNum}: ${dateStr} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

showAllAssignments();
