const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

async function testCompleteSolution() {
  try {
    console.log('🧪 Testing complete homeroom room filtering solution...\n');
    
    // Test all grades
    const grades = await db.raw('SELECT * FROM grades ORDER BY name');
    const schoolYear = 'תשפ"ד';
    
    const gradeToRoomType = {
      'א': 'CLASSROOM_A',
      'ב': 'CLASSROOM_B', 
      'ג': 'CLASSROOM_C',
      'ד': 'CLASSROOM_D',
      'ה': 'CLASSROOM_E',
      'ו': 'CLASSROOM_F'
    };
    
    for (const grade of grades.rows) {
      console.log(`📚 Testing grade: ${grade.name} (${grade.id})`);
      
      const targetRoomType = gradeToRoomType[grade.name];
      console.log(`🎯 Target room type: ${targetRoomType}`);
      
      try {
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
        
        console.log(`✅ Found ${availableRoomsQuery.rows.length} available rooms:`);
        availableRoomsQuery.rows.forEach(room => {
          console.log(`  - ${room.room_number}: ${room.room_type} (capacity: ${room.capacity}, priority: ${room.priority_score})`);
        });
        
      } catch (error) {
        console.log(`❌ Error for grade ${grade.name}: ${error.message}`);
      }
      
      console.log(''); // Empty line for readability
    }
    
    console.log('🎉 Complete solution test finished!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testCompleteSolution();
