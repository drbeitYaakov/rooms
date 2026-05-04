import { db } from './src/backend/config/database.js';

async function checkTableStructure() {
  try {
    console.log('Checking assignments table structure...');
    
    // Get table info
    const tableInfo = await db.raw(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'assignments'
      ORDER BY ordinal_position
    `);
    
    console.log('\nAssignments table columns:');
    tableInfo.rows.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} (${col.is_nullable})${col.column_default ? ` [default: ${col.column_default}]` : ''}`);
    });
    
    // Get indexes
    const indexes = await db.raw(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'assignments'
      ORDER BY indexname
    `);
    
    console.log('\nIndexes on assignments table:');
    indexes.rows.forEach(idx => {
      console.log(`- ${idx.indexname}: ${idx.indexdef}`);
    });
    
    // Get constraints
    const constraints = await db.raw(`
      SELECT conname, contype, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'assignments'::regclass
      ORDER BY conname
    `);
    
    console.log('\nConstraints on assignments table:');
    constraints.rows.forEach(con => {
      console.log(`- ${con.conname} (${con.contype}): ${con.definition}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

checkTableStructure();
