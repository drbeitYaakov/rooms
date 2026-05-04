exports.up = function(knex) {
  return knex.schema.hasColumn('rooms', 'is_active')
    .then(exists => {
      if (!exists) {
        return knex.schema.table('rooms', function(table) {
          table.boolean('is_active').defaultTo(true);
        });
      }
    });
};

exports.down = function(knex) {
  return knex.schema.hasColumn('rooms', 'is_active')
    .then(exists => {
      if (exists) {
        return knex.schema.table('rooms', function(table) {
          table.dropColumn('is_active');
        });
      }
    });
};
