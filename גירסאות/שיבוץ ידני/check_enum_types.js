const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_apHqAdu3Uk1G@ep-small-sky-agb0vyap-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkEnumTypes() {
  try {
    await client.connect();
    
    console.log('🔍 Checking enum types...');
    
    // Get all enum types
    const enumTypes = await client.query(`
      SELECT t.typname AS enum_name, 
             e.enumlabel AS enum_value
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typtype = 'e'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    enumTypes.rows.forEach(row => {
      console.log(`\n📋 ${row.enum_name}:`);
      console.log(`  - ${row.enum_value}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkEnumTypes();
