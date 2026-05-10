const fetch = require('node-fetch');

async function testManualScheduling() {
  const baseURL = 'https://rooms-ma9h.onrender.com/api';
  
  // Test data for manual scheduling
  const testAssignment = {
    room_id: 'your-room-id-here', // You'll need to get a valid room ID
    date: '2026-02-25',
    start_time: '15:00',
    end_time: '16:00',
    activity_type: 'meeting',
    assignment_type: 'one_time',
    assignable_type: 'meeting',
    specific_date: '2026-02-25',
    days_of_week: [],
    time_slots: [{ start: '15:00', end: '16:00' }]
  };

  try {
    // First, get available rooms
    console.log('Fetching available rooms...');
    const roomsResponse = await fetch(`${baseURL}/rooms`);
    const roomsData = await roomsResponse.json();
    
    if (roomsData.success && roomsData.data.rooms.length > 0) {
      const firstRoom = roomsData.data.rooms[0];
      testAssignment.room_id = firstRoom.id;
      console.log(`Using room: ${firstRoom.room_number} (ID: ${firstRoom.id})`);
      
      // Test 1: Create first assignment
      console.log('\n=== Test 1: Creating first assignment ===');
      const response1 = await fetch(`${baseURL}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer your-token-here' // You'll need a valid auth token
        },
        body: JSON.stringify(testAssignment)
      });
      
      const result1 = await response1.json();
      console.log('Response 1:', JSON.stringify(result1, null, 2));
      
      // Test 2: Try to create duplicate assignment
      console.log('\n=== Test 2: Creating duplicate assignment (should fail) ===');
      const response2 = await fetch(`${baseURL}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer your-token-here'
        },
        body: JSON.stringify(testAssignment)
      });
      
      const result2 = await response2.json();
      console.log('Response 2:', JSON.stringify(result2, null, 2));
      
      // Test 3: Create assignment with different time (should succeed)
      console.log('\n=== Test 3: Creating assignment with different time (should succeed) ===');
      testAssignment.start_time = '16:30';
      testAssignment.end_time = '17:30';
      
      const response3 = await fetch(`${baseURL}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer your-token-here'
        },
        body: JSON.stringify(testAssignment)
      });
      
      const result3 = await response3.json();
      console.log('Response 3:', JSON.stringify(result3, null, 2));
      
    } else {
      console.log('No rooms available');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testManualScheduling();
