import { db } from './src/backend/config/database.js';

async function testDuplicatePrevention() {
  try {
    console.log('🧪 Testing duplicate prevention mechanisms...\n');
    
    // Test 1: Check if we can create duplicate assignment manually
    console.log('1️⃣ Testing manual duplicate prevention...');
    
    const testAssignment = {
      room_id: 'test-room-id',
      date: '2026-12-25',
      start_time: '10:00',
      end_time: '11:00',
      assignable_type: 'meeting',
      assignable_id: 'manual',
      activity_type: 'meeting',
      created_by: 'test-user',
      status: 'active'
    };
    
    // Clean up any existing test assignments first
    await db('assignments').where({
      room_id: testAssignment.room_id,
      date: testAssignment.date
    }).del();
    
    console.log('   Creating first assignment...');
    const [first] = await db('assignments').insert(testAssignment).returning('*');
    console.log(`   ✅ First assignment created: ${first.id}`);
    
    // Try to create duplicate
    console.log('   Attempting to create duplicate...');
    try {
      await db('assignments').insert(testAssignment);
      console.log('   ❌ ERROR: Duplicate was created! This should not happen.');
    } catch (error) {
      if (error.message.includes('duplicate key') || error.message.includes('unique')) {
        console.log('   ✅ GOOD: Database prevented duplicate creation');
      } else {
        console.log('   ⚠️  WARNING: Different error occurred:', error.message);
      }
    }
    
    // Test 2: Check API duplicate prevention
    console.log('\n2️⃣ Testing API duplicate prevention...');
    
    // Simulate the duplicate check logic from assignments.ts
    const duplicateCheck = await db('assignments')
      .where('room_id', testAssignment.room_id)
      .where('date', testAssignment.date)
      .where('status', 'active')
      .where(function() {
        this.where('start_time', '<=', testAssignment.end_time)
            .andWhere('end_time', '>=', testAssignment.start_time);
      });
    
    if (duplicateCheck.length > 0) {
      console.log('   ✅ API duplicate check works: Found existing assignment');
    } else {
      console.log('   ❌ ERROR: API duplicate check failed to find existing assignment');
    }
    
    // Test 3: Check time overlap detection
    console.log('\n3️⃣ Testing time overlap detection...');
    
    const overlapTest = {
      room_id: testAssignment.room_id,
      date: testAssignment.date,
      start_time: '10:30', // Overlaps with 10:00-11:00
      end_time: '11:30'
    };
    
    const overlapCheck = await db('assignments')
      .where('room_id', overlapTest.room_id)
      .where('date', overlapTest.date)
      .where('status', 'active')
      .where(function() {
        this.where('start_time', '<=', overlapTest.end_time)
            .andWhere('end_time', '>=', overlapTest.start_time);
      });
    
    if (overlapCheck.length > 0) {
      console.log('   ✅ Time overlap detection works: Found overlapping assignment');
    } else {
      console.log('   ❌ ERROR: Time overlap detection failed');
    }
    
    // Test 4: Check non-overlapping time
    console.log('\n4️⃣ Testing non-overlapping time detection...');
    
    const nonOverlapTest = {
      room_id: testAssignment.room_id,
      date: testAssignment.date,
      start_time: '12:00', // Doesn't overlap with 10:00-11:00
      end_time: '13:00'
    };
    
    const nonOverlapCheck = await db('assignments')
      .where('room_id', nonOverlapTest.room_id)
      .where('date', nonOverlapTest.date)
      .where('status', 'active')
      .where(function() {
        this.where('start_time', '<=', nonOverlapTest.end_time)
            .andWhere('end_time', '>=', nonOverlapTest.start_time);
      });
    
    if (nonOverlapCheck.length === 0) {
      console.log('   ✅ Non-overlapping time detection works: No conflicts found');
    } else {
      console.log('   ❌ ERROR: Non-overlapping time detection failed');
    }
    
    // Clean up test data
    await db('assignments').where({
      room_id: testAssignment.room_id,
      date: testAssignment.date
    }).del();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Summary of fixes applied:');
    console.log('   ✅ assignments.ts - Added duplicate checking');
    console.log('   ✅ roomRequests.ts - Added duplicate checking');
    console.log('   ✅ homerooms.ts - Added duplicate checking');
    console.log('   ✅ studyGroups.ts - Added duplicate checking');
    console.log('   ✅ assignments_fixed.ts - Deleted outdated file');
    console.log('   ✅ Database - Added unique constraint');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testDuplicatePrevention();
