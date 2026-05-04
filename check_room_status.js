const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw('SELECT unnest(enum_range(NULL::"RoomStatus")) as status_value').then(result => {
  console.log('Valid RoomStatus enum values:');
  result.rows.forEach(row => console.log(`- ${row.status_value}`));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
