const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/educational_scheduling'
});

async function checkAssignmentCreation() {
  try {
    console.log('🔍 Checking assignment creation process...\n');
    
    // 1. Check the assignments table structure
    console.log('📋 === ASSIGNMENTS TABLE STRUCTURE ===');
    const tableStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'assignments' 
      ORDER BY ordinal_position
    `);
    
    tableStructure.rows.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type} (${col.is_nullable}) ${col.column_default ? `[${col.column_default}]` : ''}`);
    });
    
    // 2. Check constraints on assignments table
    console.log('\n🔒 === TABLE CONSTRAINTS ===');
    const constraints = await pool.query(`
      SELECT 
        tc.constraint_name, 
        tc.constraint_type,
        kcu.column_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'assignments'
      ORDER BY tc.constraint_type, tc.constraint_name
    `);
    
    constraints.rows.forEach(constraint => {
      console.log(`  ${constraint.constraint_type}: ${constraint.constraint_name} (${constraint.column_name || 'N/A'})`);
      if (constraint.check_clause) {
        console.log(`    CHECK: ${constraint.check_clause}`);
      }
    });
    
    // 3. Check for unique constraints specifically
    console.log('\n🚫 === UNIQUE CONSTRAINTS ===');
    const uniqueConstraints = await pool.query(`
      SELECT 
        tc.constraint_name,
        kcu.column_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.check_constraints cc 
        ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'assignments' 
      AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.constraint_name
    `);
    
    if (uniqueConstraints.rows.length > 0) {
      uniqueConstraints.rows.forEach(constraint => {
        console.log(`  UNIQUE: ${constraint.constraint_name} (${constraint.column_name})`);
      });
    } else {
      console.log('  No unique constraints found');
    }
    
    // 4. Check recent manual assignments
    console.log('\n✋ === RECENT MANUAL ASSIGNMENTS ===');
    const recentManual = await pool.query(`
      SELECT 
        id,
        room_id,
        date,
        start_time,
        end_time,
        activity_type,
        is_manual,
        status,
        created_by,
        created_at
      FROM assignments 
      WHERE is_manual = true 
      AND status = 'active'
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${recentManual.rows.length} recent manual assignments:`);
    recentManual.rows.forEach((assignment, index) => {
      console.log(`  ${index + 1}. Room: ${assignment.room_id}, Date: ${assignment.date?.toISOString().split('T')[0]}, Time: ${assignment.start_time}-${assignment.end_time}, Type: ${assignment.activity_type}, Created: ${assignment.created_at?.toISOString().split('T')[0]}`);
    });
    
    // 5. Check for potential duplicates
    console.log('\n🔍 === POTENTIAL DUPLICATES CHECK ===');
    const duplicatesCheck = await pool.query(`
      SELECT 
        room_id,
        date,
        start_time,
        end_time,
        COUNT(*) as duplicate_count,
        STRING_AGG(id::text, ', ') as assignment_ids
      FROM assignments 
      WHERE status = 'active'
      GROUP BY room_id, date, start_time, end_time
      HAVING COUNT(*) > 1
      ORDER BY date, room_id
    `);
    
    if (duplicatesCheck.rows.length > 0) {
      console.log(`Found ${duplicatesCheck.rows.length} potential duplicates:`);
      duplicatesCheck.rows.forEach(dup => {
        console.log(`  🚨 Room ${dup.room_id} on ${dup.date} ${dup.start_time}-${dup.end_time}: ${dup.duplicate_count} assignments (${dup.assignment_ids})`);
      });
    } else {
      console.log('  ✅ No duplicates found');
    }
    
    // 6. Check assignments by date to see distribution
    console.log('\n📅 === ASSIGNMENTS BY DATE ===');
    const byDate = await pool.query(`
      SELECT 
        DATE(date) as date,
        COUNT(*) as total,
        COUNT(CASE WHEN is_manual = true THEN 1 END) as manual,
        COUNT(CASE WHEN is_manual = false THEN 1 END) as automatic
      FROM assignments 
      WHERE status = 'active'
      GROUP BY DATE(date)
      ORDER BY date DESC
      LIMIT 10
    `);
    
    byDate.rows.forEach(row => {
      console.log(`  ${row.date}: ${row.total} total (${row.manual} manual, ${row.automatic} automatic)`);
    });
    
    // 7. Check room assignments distribution
    console.log('\n🏠 === ASSIGNMENTS BY ROOM ===');
    const byRoom = await pool.query(`
      SELECT 
        r.room_number,
        COUNT(a.id) as total,
        COUNT(CASE WHEN a.is_manual = true THEN 1 END) as manual,
        COUNT(CASE WHEN a.is_manual = false THEN 1 END) as automatic
      FROM assignments a
      LEFT JOIN rooms r ON a.room_id = r.id
      WHERE a.status = 'active'
      GROUP BY r.room_number, a.room_id
      ORDER BY r.room_number
    `);
    
    byRoom.rows.forEach(row => {
      console.log(`  Room ${row.room_number}: ${row.total} total (${row.manual} manual, ${row.automatic} automatic)`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkAssignmentCreation();
