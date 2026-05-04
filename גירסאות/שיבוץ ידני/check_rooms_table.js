const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\'').then(result => {
  console.log('Tables in database:');
  result.rows.forEach(row => console.log(`- ${row.table_name}`));
  
  // Check if rooms table exists
  const hasRooms = result.rows.some(row => row.table_name === 'rooms');
  console.log(`\nRooms table exists: ${hasRooms}`);
  
  if (hasRooms) {
    // Check rooms table structure
    return db.raw('SELECT column_name, data_type FROM information_schema.columns WHERE table_name = \'rooms\' ORDER BY ordinal_position');
  } else {
    process.exit(0);
  }
}).then(result => {
  if (result) {
    console.log('\nRooms table structure:');
    result.rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
  }
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
