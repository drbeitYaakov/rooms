const knex = require('knex');
const config = require('./knexfile.js');
const db = knex(config.development);

db.raw('SELECT * FROM grades').then(result => {
  console.log('Grades data:');
  result.rows.forEach(row => console.log(`ID: ${row.id}, Name: '${row.name}'`));
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
