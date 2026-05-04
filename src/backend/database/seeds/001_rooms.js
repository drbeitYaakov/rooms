exports.seed = async function(knex) {
  // Deletes ALL existing entries
  await knex('rooms').del();

  // Inserts seed entries
  await knex('rooms').insert([
    {
      id: 1,
      room_number: '101',
      floor: 1,
      wing: 'A',
      side: 'east',
      room_type: 'homeroom',
      has_projector: true,
      is_small: false,
      capacity: 30,
      priority: 'high',
      reserved_for: 'grade_1',
      grade_level: 1,
      notes: 'כיתה אם לכיתה א׳',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 2,
      room_number: '102',
      floor: 1,
      wing: 'A',
      side: 'west',
      room_type: 'homeroom',
      has_projector: true,
      is_small: false,
      capacity: 30,
      priority: 'high',
      reserved_for: 'grade_2',
      grade_level: 2,
      notes: 'כיתה אם לכיתה ב׳',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 3,
      room_number: '201',
      floor: 2,
      wing: 'B',
      side: 'east',
      room_type: 'study',
      has_projector: false,
      is_small: true,
      capacity: 15,
      priority: 'normal',
      reserved_for: null,
      grade_level: null,
      notes: 'חדר הקבצה קטן',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 4,
      room_number: '301',
      floor: 3,
      wing: 'C',
      side: 'center',
      room_type: 'computer',
      has_projector: true,
      is_small: false,
      capacity: 25,
      priority: 'high',
      reserved_for: null,
      grade_level: null,
      notes: 'חדר ממ"ד עם מחשבים',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    },
    {
      id: 5,
      room_number: '302',
      floor: 3,
      wing: 'C',
      side: 'west',
      room_type: 'regular',
      has_projector: false,
      is_small: false,
      capacity: 20,
      priority: 'low',
      reserved_for: null,
      grade_level: null,
      notes: 'חדר רגיל לאנגלית',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  ]);
};
