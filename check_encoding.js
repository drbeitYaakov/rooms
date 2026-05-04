const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw("SELECT id, name, convert_from(convert_to(name, 'UTF8'), 'UTF8') as clean_name FROM grades").then(result => {
  console.log('Grades with encoding check:');
  result.rows.forEach(row => console.log(`ID: ${row.id}, Original: '${row.name}', Clean: '${row.clean_name}'`));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
