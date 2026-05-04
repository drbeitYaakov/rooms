const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw('SELECT DISTINCT room_type FROM rooms WHERE is_active = true ORDER BY room_type').then(result => {
  console.log('Available room types:');
  result.rows.forEach(row => console.log(`- ${row.room_type}`));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
