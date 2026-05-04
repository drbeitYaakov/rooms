// בדיקת constraint על type
const knex = require('knex');
const knexConfig = require('./knexfile');

async function checkTypeConstraint() {
  const db = knex(knexConfig.development);
  
  try {
    console.log('🔍 Checking type constraint...');
    
    // Check constraint
    const result = await db.raw(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conrelid = 'assignments'::regclass 
        AND contype = 'c'
        AND conname = 'assignments_type_check'
    `);
    
    console.log('Type constraint:', result.rows);
    
    // Check existing types
    const types = await db('assignments').distinct('type').pluck('type');
    console.log('Existing types in database:', types);
    
    // Check what the frontend sends
    console.log('🤔 The issue might be that assignmentRequest.type has invalid value');
    console.log('📋 Common valid values are: one_time, recurring');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.destroy();
  }
}

checkTypeConstraint();
