exports.up = function(knex) {
  return Promise.all([
    // Add missing columns to users table
    knex.schema.hasColumn('users', 'grade_id').then(exists => {
      if (!exists) {
        return knex.schema.table('users', function(table) {
          table.string('grade_id');
        });
      }
    }),
    
    knex.schema.hasColumn('users', 'is_active').then(exists => {
      if (!exists) {
        return knex.schema.table('users', function(table) {
          table.boolean('is_active').defaultTo(true);
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.hasColumn('users', 'grade_id').then(exists => {
      if (exists) {
        return knex.schema.table('users', function(table) {
          table.dropColumn('grade_id');
        });
      }
    }),
    
    knex.schema.hasColumn('users', 'is_active').then(exists => {
      if (exists) {
        return knex.schema.table('users', function(table) {
          table.dropColumn('is_active');
        });
      }
    })
  ]);
};
