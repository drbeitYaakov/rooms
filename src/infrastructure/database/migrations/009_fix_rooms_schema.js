exports.up = function(knex) {
  return Promise.all([
    // Add missing columns to rooms table
    knex.schema.hasColumn('rooms', 'is_active').then(exists => {
      if (!exists) {
        return knex.schema.table('rooms', function(table) {
          table.boolean('is_active').defaultTo(true);
        });
      }
    }),
    
    knex.schema.hasColumn('rooms', 'grade_level').then(exists => {
      if (!exists) {
        return knex.schema.table('rooms', function(table) {
          table.string('grade_level');
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.hasColumn('rooms', 'is_active').then(exists => {
      if (exists) {
        return knex.schema.table('rooms', function(table) {
          table.dropColumn('is_active');
        });
      }
    }),
    
    knex.schema.hasColumn('rooms', 'grade_level').then(exists => {
      if (exists) {
        return knex.schema.table('rooms', function(table) {
          table.dropColumn('grade_level');
        });
      }
    })
  ]);
};
