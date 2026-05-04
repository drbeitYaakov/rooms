exports.up = function(knex) {
  return Promise.all([
    // Check and add is_active to rooms if missing
    knex.schema.hasColumn('rooms', 'is_active').then(exists => {
      if (!exists) {
        return knex.schema.table('rooms', function(table) {
          table.boolean('is_active').defaultTo(true);
        });
      }
    }),
    
    // Check and add is_active to homerooms if missing
    knex.schema.hasColumn('homerooms', 'is_active').then(exists => {
      if (!exists) {
        return knex.schema.table('homerooms', function(table) {
          table.boolean('is_active').defaultTo(true);
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
    
    knex.schema.hasColumn('homerooms', 'is_active').then(exists => {
      if (exists) {
        return knex.schema.table('homerooms', function(table) {
          table.dropColumn('is_active');
        });
      }
    })
  ]);
};
