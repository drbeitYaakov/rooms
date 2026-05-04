exports.seed = function(knex) {
  return knex('rooms')
    .del()
    .then(function () {
      return knex('rooms').insert([
        {
          id: knex.raw('gen_random_uuid()'),
          room_number: '101',
          floor: 1,
          wing: 'old',
          room_type: 'mamad',
          has_projector: true,
          is_small: false,
          capacity: 30,
          priority: 'normal',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: knex.raw('gen_random_uuid()'),
          room_number: '102',
          floor: 1,
          wing: 'old',
          room_type: 'mamad',
          has_projector: true,
          is_small: false,
          capacity: 30,
          priority: 'normal',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: knex.raw('gen_random_uuid()'),
          room_number: '201',
          floor: 2,
          wing: 'old',
          room_type: 'study_group',
          has_projector: false,
          is_small: true,
          capacity: 15,
          priority: 'normal',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]);
    });
};
