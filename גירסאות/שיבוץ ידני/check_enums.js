const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_apHqAdu3Uk1G@ep-small-sky-agb0vyap-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function checkEnums() {
  try {
    await client.connect();
    
    console.log('🔍 Enum types in database:');
    const enums = await client.query(`
      SELECT t.typname, e.enumlabel 
      FROM pg_type t 
      JOIN pg_enum e ON t.oid = e.enumtypid  
      WHERE t.typtype = 'e'
      ORDER BY t.typname, e.enumsortorder
    `);
    
    let currentEnum = '';
    enums.rows.forEach(row => {
      if (row.typname !== currentEnum) {
        currentEnum = row.typname;
        console.log(`\n📋 ${row.typname}:`);
      }
      console.log(`  - ${row.enumlabel}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkEnums();
