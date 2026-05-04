// Fetch all assignments via the backend API
async function checkAllAssignmentsViaAPI() {
  try {
    console.log('🔍 Fetching all assignments via API...\n');
    
    // Get all rooms first
    const roomsResponse = await fetch('http://localhost:3001/api/rooms');
    if (!roomsResponse.ok) {
      throw new Error('Failed to fetch rooms');
    }
    const rooms = await roomsResponse.json();
    console.log(`📊 Found ${rooms.length} rooms\n`);
    
    // Get all assignments
    const assignmentsResponse = await fetch('http://localhost:3001/api/assignments');
    if (!assignmentsResponse.ok) {
      throw new Error('Failed to fetch assignments');
    }
    const assignments = await assignmentsResponse.json();
    
    console.log(`📊 Total assignments: ${assignments.length}\n`);
    
    // Group active assignments by date
    const activeAssignments = assignments.filter(a => a.status === 'active');
    console.log(`📊 Active assignments: ${activeAssignments.length}\n`);
    
    const assignmentsByDate = {};
    activeAssignments.forEach(assignment => {
      const date = assignment.date.split('T')[0]; // Get just the date part
      if (!assignmentsByDate[date]) {
        assignmentsByDate[date] = [];
      }
      assignmentsByDate[date].push(assignment);
    });
    
    // Display by date
    Object.keys(assignmentsByDate).sort().forEach(date => {
      console.log(`📅 Date: ${date}`);
      assignmentsByDate[date].forEach(assignment => {
        const room = rooms.find(r => r.id === assignment.room_id);
        const roomNumber = room ? room.number : assignment.room_id.substring(0, 8);
        const manualText = assignment.is_manual ? '(manual)' : '(default)';
        console.log(`  🏠 Room ${roomNumber}: ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
      });
      console.log('');
    });
    
    // Check specifically for Friday assignments
    console.log('🔍 Checking Friday assignments specifically...');
    const fridayAssignments = activeAssignments.filter(assignment => {
      const date = new Date(assignment.date);
      return date.getDay() === 5; // Friday
    });
    
    console.log(`📊 Total Friday assignments: ${fridayAssignments.length}\n`);
    fridayAssignments.forEach(assignment => {
      const room = rooms.find(r => r.id === assignment.room_id);
      const roomNumber = room ? room.number : assignment.room_id.substring(0, 8);
      const manualText = assignment.is_manual ? '(manual)' : '(default)';
      console.log(`  🏠 Room ${roomNumber}: ${assignment.date.split('T')[0]} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
    });
    
    // Check assignments for this week (Feb 22-28)
    console.log('\n🔍 Checking assignments for this week (Feb 22-28)...');
    const weekStart = new Date('2026-02-22');
    const weekEnd = new Date('2026-02-28');
    
    const weekAssignments = activeAssignments.filter(assignment => {
      const assignmentDate = new Date(assignment.date);
      return assignmentDate >= weekStart && assignmentDate <= weekEnd;
    });
    
    console.log(`📊 Total assignments this week: ${weekAssignments.length}\n`);
    weekAssignments.forEach(assignment => {
      const room = rooms.find(r => r.id === assignment.room_id);
      const roomNumber = room ? room.number : assignment.room_id.substring(0, 8);
      const manualText = assignment.is_manual ? '(manual)' : '(default)';
      console.log(`  🏠 Room ${roomNumber}: ${assignment.date.split('T')[0]} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type} ${manualText}`);
    });
    
    // Check for potential issues
    console.log('\n🔍 Checking for potential issues...');
    
    // Check assignments with end_time before start_time
    const timeIssues = activeAssignments.filter(assignment => {
      const [startHour, startMinute] = assignment.start_time.split(':').map(Number);
      const [endHour, endMinute] = assignment.end_time.split(':').map(Number);
      const startTimeInMinutes = startHour * 60 + startMinute;
      const endTimeInMinutes = endHour * 60 + endMinute;
      
      return endTimeInMinutes <= startTimeInMinutes;
    });
    
    if (timeIssues.length > 0) {
      console.log(`⚠️  Found ${timeIssues.length} assignments with end_time <= start_time:`);
      timeIssues.forEach(assignment => {
        const room = rooms.find(r => r.id === assignment.room_id);
        const roomNumber = room ? room.number : assignment.room_id.substring(0, 8);
        console.log(`  🚨 Room ${roomNumber}: ${assignment.date.split('T')[0]} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type}`);
      });
    } else {
      console.log('✅ No time issues found');
    }
    
    // Check for manual assignments specifically
    console.log('\n🔍 Checking manual assignments...');
    const manualAssignments = activeAssignments.filter(a => a.is_manual);
    console.log(`📊 Total manual assignments: ${manualAssignments.length}\n`);
    
    manualAssignments.forEach(assignment => {
      const room = rooms.find(r => r.id === assignment.room_id);
      const roomNumber = room ? room.number : assignment.room_id.substring(0, 8);
      console.log(`  ✋ Room ${roomNumber}: ${assignment.date.split('T')[0]} ${assignment.start_time}-${assignment.end_time} ${assignment.activity_type}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAllAssignmentsViaAPI();
