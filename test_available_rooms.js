const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function testAvailableRooms() {
  try {
    // Test for grade 'א' 
    const gradeId = 'a6a25529-fe66-443e-9473-3b3d5c616de3'; // Grade 'א'
    const schoolYear = 'תשפ"ד';
    
    console.log(`Testing available rooms for grade 'א' (${gradeId}) in ${schoolYear}`);
    console.log('🔍 Step 1: Testing simple query...');
    
    // Test simple query first
    const simpleQuery = await db.raw('SELECT COUNT(*) as count FROM grades');
    console.log(`✅ Simple query works: ${simpleQuery.rows[0].count} grades in database`);
    
    console.log('🔍 Step 2: Getting grade info...');
    
    // Get grade info - try without parameter first
    const allGradesQuery = await db.raw('SELECT * FROM grades');
    console.log(`✅ All grades query works: ${allGradesQuery.rows.length} grades found`);
    
    const grade = allGradesQuery.rows.find(g => g.id === gradeId);
    console.log(`✅ Found grade by ID: ${grade ? grade.name : 'Not found'}`);
    
    if (!grade) {
      console.log('❌ Grade not found');
      console.log('Available grade IDs:');
      allGradesQuery.rows.forEach(g => console.log(`  - ${g.id}: ${g.name}`));
      process.exit(1);
    }
    
    console.log(`✅ Found grade: ${grade.name}`);
    
    // Map grade name to room type pattern
    const gradeToRoomType = {
      'א': 'CLASSROOM_A',
      'ב': 'CLASSROOM_B', 
      'ג': 'CLASSROOM_C',
      'ד': 'CLASSROOM_D',
      'ה': 'CLASSROOM_E',
      'ו': 'CLASSROOM_F'
    };
    
    const targetRoomType = gradeToRoomType[grade.name];
    console.log(`🎯 Target room type: ${targetRoomType}`);
    
    console.log('🔍 Step 2: Getting available rooms...');
    console.log(`Parameters: schoolYear="${schoolYear}", targetRoomType="${targetRoomType}"`);
    
    // Try a simpler query first
    const simpleRoomQuery = await db.raw('SELECT * FROM rooms WHERE room_type = ? AND is_active = true', [targetRoomType]);
    console.log(`✅ Simple room query works: ${simpleRoomQuery.rows.length} rooms found`);
    
    // Now try the full query
    const availableRoomsQuery = await db.raw(`
      SELECT r.*, 
             CASE 
               WHEN r.room_type = ? THEN 100
               WHEN r.room_type = 'MAMAD' THEN 80
               WHEN r.room_type = 'HOMEROOM' THEN 70
               WHEN r.room_type = 'REGULAR' THEN 60
               ELSE 10
             END as priority_score
      FROM rooms r
      WHERE r.is_active = true
        AND r.room_type = ?
        AND r.id NOT IN (
          SELECT room_id FROM homerooms 
          WHERE school_year = ?
        )
        AND r.capacity >= 30
      ORDER BY priority_score DESC, r.room_number
    `, [targetRoomType, targetRoomType, schoolYear]);
    
    console.log('✅ Available rooms query executed successfully');
    
    console.log(`📋 Found ${availableRoomsQuery.rows.length} available rooms:`);
    availableRoomsQuery.rows.forEach(room => {
      console.log(`  - ${room.room_number}: ${room.room_type} (capacity: ${room.capacity}, priority: ${room.priority_score})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testAvailableRooms();
