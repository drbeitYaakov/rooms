const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw('SELECT DISTINCT wing FROM rooms WHERE is_active = true ORDER BY wing').then(result => {
  console.log('Available wing types:');
  result.rows.forEach(row => console.log(`- ${row.wing}`));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
