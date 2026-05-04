exports.up = function(knex) {
  return Promise.all([
    // Add missing columns to grades table
    knex.schema.hasColumn('grades', 'coordinator_id').then(exists => {
      if (!exists) {
        return knex.schema.table('grades', function(table) {
          table.text('coordinator_id'); // Use text to match users.id type
        });
      }
    }),
    
    knex.schema.hasColumn('grades', 'level').then(exists => {
      if (!exists) {
        return knex.schema.table('grades', function(table) {
          table.string('level');
        });
      }
    }),
    
    knex.schema.hasColumn('grades', 'updated_at').then(exists => {
      if (!exists) {
        return knex.schema.table('grades', function(table) {
          table.timestamp('updated_at').defaultTo(knex.fn.now());
        });
      }
    })
  ]);
};

exports.down = function(knex) {
  return Promise.all([
    knex.schema.hasColumn('grades', 'coordinator_id').then(exists => {
      if (exists) {
        return knex.schema.table('grades', function(table) {
          table.dropColumn('coordinator_id');
        });
      }
    }),
    
    knex.schema.hasColumn('grades', 'level').then(exists => {
      if (exists) {
        return knex.schema.table('grades', function(table) {
          table.dropColumn('level');
        });
      }
    }),
    
    knex.schema.hasColumn('grades', 'updated_at').then(exists => {
      if (exists) {
        return knex.schema.table('grades', function(table) {
          table.dropColumn('updated_at');
        });
      }
    })
  ]);
};
