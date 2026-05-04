import { Knex } from 'knex';

const enumDefinitions: Record<string, string[]> = {
  UserRole: ['ADMIN', 'GRADE_COORDINATOR', 'HAGBATZA_COORDINATOR', 'REGULAR_USER'],
  RoomType: [
    'REGULAR', 'AUDITORIUM', 'MUSIC', 'LIBRARY', 'MAMAD', 'HAGBAA', 'CARAVAN',
    'COORDINATOR', 'ATTIC', 'ALBEK', 'CLASSROOM_A', 'CLASSROOM_B', 'CLASSROOM_C',
    'CLASSROOM_D', 'CLASSROOM_E', 'CLASSROOM_F', 'CLASSROOM_G', 'CLASSROOM_H',
    'CLASSROOM_I', 'CLASSROOM_J', 'CLASSROOM_K', 'CLASSROOM_L', 'CLASSROOM_M',
    'CLASSROOM_N', 'CLASSROOM_S', 'CLASSROOM_EIN', 'CLASSROOM_P', 'CLASSROOM_TZADI',
    'CLASSROOM_KUF', 'CLASSROOM_RESH', 'CLASSROOM_SHIN', 'CLASSROOM_TAV', 'HOMEROOM',
  ],
  WingType: ['OLD', 'NEW', 'CENTER', 'RIGHT', 'LEFT', 'YARD', 'SPECIAL'],
  ComfortLevel: ['COMFORTABLE', 'LESS_COMFORTABLE', 'MINIMAL'],
  RoomStatus: ['ACTIVE', 'DISABLED', 'RESERVED', 'FUTURE'],
  SubjectType: ['MATH', 'ENGLISH', 'TRACK', 'OTHER', 'PE'],
  GroupType: ['HAGBATZA', 'INSIGHT', 'SUGIYOT', 'SIACH', 'TRACK', 'OTHER'],
  AuditAction: ['CREATE', 'UPDATE', 'DELETE', 'OVERRIDE', 'BULK_ASSIGN', 'NOTIFICATION'],
  ScheduleType: ['MOTHER_CLASS', 'HAGBATZA', 'TRACK', 'PERMANENT_GROUP', 'ONE_TIME', 'TEMPORARY'],
  EventType: ['REGULAR', 'EDUCATION_DAY', 'REPORT_CARDS', 'PERSONAL_MEETING', 'CAMP_EVENING', 'CAMP_REHEARSAL', 'MAKEUP_EXAM', 'ATTENDANCE', 'PARTY'],
  RecurrencePattern: ['WEEKLY', 'ONE_TIME', 'CUSTOM'],
  ScheduleStatus: ['ACTIVE', 'PENDING', 'CANCELLED', 'MOVED'],
  ExceptionType: ['CANCELLED', 'MOVED', 'ROOM_CHANGED'],
  SpecialDayType: ['DIDACTICS', 'NO_CLASSES', 'SPECIAL_SCHEDULE', 'HOLIDAY'],
};

async function createEnumType(knex: Knex, name: string, values: string[]) {
  const quotedValues = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
        CREATE TYPE "${name}" AS ENUM (${quotedValues});
      END IF;
    END
    $$;
  `);
}

async function dropEnumType(knex: Knex, name: string) {
  await knex.raw(`DROP TYPE IF EXISTS "${name}" CASCADE`);
}

export async function up(knex: Knex): Promise<void> {
  for (const [name, values] of Object.entries(enumDefinitions)) {
    await createEnumType(knex, name, values);
  }

  await knex.schema.createTable('academic_years', (table) => {
    table.text('id').primary();
    table.text('year_name').notNullable().unique();
    table.timestamp('start_date').notNullable();
    table.timestamp('end_date').notNullable();
    table.boolean('is_active').notNullable().defaultTo(false);
    table.boolean('is_archived').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('rooms', (table) => {
    table.text('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('room_number').notNullable().unique();
    table.integer('floor').notNullable();
    table.specificType('wing', '"WingType"').notNullable().defaultTo('SPECIAL');
    table.integer('capacity').notNullable().defaultTo(30);
    table.boolean('has_projector').notNullable().defaultTo(false);
    table.specificType('room_type', '"RoomType"').notNullable().defaultTo('REGULAR');
    table.specificType('comfort_level', '"ComfortLevel"').notNullable().defaultTo('COMFORTABLE');
    table.specificType('status', '"RoomStatus"').notNullable().defaultTo('ACTIVE');
    table.text('special_notes').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.text('side').nullable();
    table.boolean('is_small').nullable().defaultTo(false);
    table.text('priority').nullable().defaultTo('normal');
    table.text('reserved_for').nullable();
    table.text('notes').nullable();
    table.boolean('is_active').nullable().defaultTo(true);
    table.string('grade_level').nullable();
    table.check(`side IS NULL OR side IN ('left', 'right')`, undefined, 'rooms_side_check');
  });

  await knex.schema.createTable('users', (table) => {
    table.text('id').primary();
    table.text('email').notNullable().unique();
    table.text('password_hash').notNullable();
    table.text('full_name').notNullable();
    table.specificType('role', '"UserRole"').notNullable().defaultTo('REGULAR_USER');
    table.text('assigned_grade_id').nullable();
    table.timestamp('last_login').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.string('grade_id').nullable();
    table.boolean('is_active').nullable().defaultTo(true);
  });

  await knex.schema.createTable('cycles', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.text('name').notNullable();
    table.text('description').nullable();
    table.text('coordinator_id').nullable().references('id').inTable('users');
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['year_id', 'name']);
  });

  await knex.schema.createTable('grades', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.text('name').notNullable();
    table.jsonb('default_rooms').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.text('cycle_id').nullable().references('id').inTable('cycles');
    table.text('coordinator_id').nullable();
    table.string('level').nullable();
    table.timestamp('updated_at', { useTz: true }).nullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['year_id', 'name']);
  });

  await knex.schema.alterTable('users', (table) => {
    table.foreign('assigned_grade_id').references('grades.id');
  });

  await knex.schema.createTable('homerooms', (table) => {
    table.increments('id').primary();
    table.text('room_id').nullable().references('id').inTable('rooms');
    table.text('grade_id').nullable().references('id').inTable('grades');
    table.integer('class_number').notNullable();
    table.text('teacher_id').nullable().references('id').inTable('users');
    table.integer('max_students').nullable().defaultTo(40);
    table.integer('current_students').nullable().defaultTo(0);
    table.string('school_year').notNullable();
    table.timestamp('created_at').nullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').nullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.boolean('is_active').nullable().defaultTo(true);
    table.string('class_name').nullable();
    table.check('class_number >= 1 AND class_number <= 7', undefined, 'homerooms_class_number_check');
  });

  await knex.schema.createTable('classrooms', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.text('grade_id').nullable().references('id').inTable('grades');
    table.text('name').notNullable();
    table.text('home_room_id').nullable().references('id').inTable('homerooms');
    table.integer('max_capacity').notNullable().defaultTo(40);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['year_id', 'name']);
    table.unique(['year_id', 'home_room_id']);
  });

  await knex.schema.createTable('groups', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.text('name').notNullable();
    table.specificType('subject', '"SubjectType"').notNullable().defaultTo('OTHER');
    table.specificType('group_type', '"GroupType"').notNullable().defaultTo('OTHER');
    table.jsonb('parent_classrooms').nullable();
    table.integer('student_count').notNullable().defaultTo(0);
    table.integer('required_capacity').notNullable().defaultTo(0);
    table.boolean('requires_projector').notNullable().defaultTo(false);
    table.jsonb('preferred_room_ids').nullable();
    table.boolean('requires_consecutive_slots').notNullable().defaultTo(false);
    table.boolean('preferred_same_room').notNullable().defaultTo(false);
    table.text('notes').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('classroom_schedules', (table) => {
    table.text('id').primary();
    table.text('classroom_id').notNullable().references('id').inTable('classrooms');
    table.integer('day_of_week').notNullable();
    table.text('start_time').notNullable();
    table.text('end_time').notNullable();
    table.boolean('is_early_dismissal').notNullable().defaultTo(false);
    table.text('early_dismissal_time').nullable();
    table.text('notes').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['classroom_id', 'day_of_week']);
  });

  await knex.schema.createTable('cycle_default_rooms', (table) => {
    table.text('id').primary();
    table.text('cycle_id').notNullable().references('id').inTable('cycles');
    table.text('room_id').notNullable().references('id').inTable('rooms');
    table.integer('priority').notNullable().defaultTo(1);
    table.unique(['cycle_id', 'room_id']);
  });

  await knex.schema.createTable('group_classroom_relations', (table) => {
    table.text('id').primary();
    table.text('group_id').notNullable().references('id').inTable('groups');
    table.text('classroom_id').notNullable().references('id').inTable('classrooms');
    table.integer('priority').notNullable().defaultTo(1);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['group_id', 'classroom_id']);
  });

  await knex.schema.createTable('schedules', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.specificType('schedule_type', '"ScheduleType"').notNullable();
    table.specificType('event_type', '"EventType"').notNullable().defaultTo('REGULAR');
    table.text('classroom_id').nullable().references('id').inTable('classrooms');
    table.text('group_id').nullable().references('id').inTable('groups');
    table.specificType('recurrence_pattern', '"RecurrencePattern"').notNullable().defaultTo('WEEKLY');
    table.integer('day_of_week').nullable();
    table.timestamp('start_datetime').notNullable();
    table.timestamp('end_datetime').notNullable();
    table.text('room_id').notNullable().references('id').inTable('rooms');
    table.specificType('status', '"ScheduleStatus"').notNullable().defaultTo('ACTIVE');
    table.integer('priority').notNullable().defaultTo(500);
    table.boolean('is_locked').notNullable().defaultTo(false);
    table.text('override_reason').nullable();
    table.float('assignment_score').nullable();
    table.text('created_by').notNullable().references('id').inTable('users');
    table.text('approved_by').nullable().references('id').inTable('users');
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('schedule_exceptions', (table) => {
    table.text('id').primary();
    table.text('schedule_id').notNullable().references('id').inTable('schedules');
    table.timestamp('exception_date').notNullable();
    table.specificType('exception_type', '"ExceptionType"').notNullable();
    table.text('new_room_id').nullable().references('id').inTable('rooms');
    table.text('reason').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['schedule_id', 'exception_date']);
  });

  await knex.schema.createTable('special_days', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.timestamp('date').notNullable();
    table.specificType('day_type', '"SpecialDayType"').notNullable();
    table.jsonb('affected_grades').nullable();
    table.text('description').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['year_id', 'date']);
  });

  await knex.schema.createTable('study_group_grade_groups', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable();
    table.string('grade_level').notNullable();
    table.integer('group_number').notNullable();
    table.jsonb('weekly_schedule').notNullable().defaultTo(knex.raw(`'[]'::jsonb`));
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.unique(['year_id', 'grade_level', 'group_number']);
    table.index(['year_id']);
  });

  await knex.schema.createTable('time_slots', (table) => {
    table.text('id').primary();
    table.text('name').notNullable().unique();
    table.text('start_time').notNullable();
    table.text('end_time').notNullable();
    table.integer('slot_index').notNullable();
    table.boolean('is_lunch_time').notNullable().defaultTo(false);
    table.boolean('is_after_hours').notNullable().defaultTo(false);
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('settings', (table) => {
    table.text('id').primary();
    table.text('key').notNullable().unique();
    table.jsonb('value').notNullable();
    table.timestamp('createdAt').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updatedAt').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('audit_logs', (table) => {
    table.text('id').primary();
    table.text('year_id').notNullable().references('id').inTable('academic_years');
    table.text('user_id').notNullable().references('id').inTable('users');
    table.specificType('action', '"AuditAction"').notNullable();
    table.text('entity_type').notNullable();
    table.text('entity_id').notNullable();
    table.jsonb('old_value').nullable();
    table.jsonb('new_value').nullable();
    table.jsonb('rules_checked').nullable();
    table.jsonb('rules_broken').nullable();
    table.text('override_approved_by').nullable().references('id').inTable('users');
    table.text('ip_address').nullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.index(['user_id'], 'idx_audit_logs_user');
  });

  await knex.schema.createTable('room_requests', (table) => {
    table.increments('id').primary();
    table.uuid('requester_id').notNullable();
    table.uuid('requested_room_id').nullable();
    table.string('activity_type').notNullable();
    table.string('grade').nullable();
    table.integer('student_count').notNullable();
    table.date('date').notNullable();
    table.time('start_time').notNullable();
    table.time('end_time').notNullable();
    table.text('special_requirements').nullable();
    table.string('status').nullable().defaultTo('pending');
    table.uuid('approved_room_id').nullable();
    table.text('notes').nullable();
    table.uuid('updated_by').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
  });

  await knex.schema.createTable('assignments', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.text('type').notNullable();
    table.text('assignable_type').notNullable();
    table.string('assignable_id').notNullable();
    table.uuid('room_id').notNullable();
    table.date('start_date').notNullable();
    table.date('end_date').nullable();
    table.integer('week_count').nullable();
    table.date('specific_date').nullable();
    table.jsonb('days_of_week').notNullable();
    table.jsonb('time_slots').notNullable();
    table.string('activity_type').notNullable();
    table.uuid('created_by').notNullable();
    table.uuid('modified_by').nullable();
    table.boolean('is_manual').nullable().defaultTo(false);
    table.text('override_reason').nullable();
    table.text('status').nullable().defaultTo('active');
    table.jsonb('conflicts_with').nullable();
    table.timestamp('created_at', { useTz: true }).nullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.timestamp('updated_at', { useTz: true }).nullable().defaultTo(knex.raw('CURRENT_TIMESTAMP'));
    table.date('date').nullable();
    table.time('start_time').nullable();
    table.time('end_time').nullable();
    table.check(`type IN ('permanent', 'temporary', 'one_time')`, undefined, 'assignments_type_check');
    table.check(`assignable_type IN ('homeroom', 'study_group', 'meeting', 'event', 'PE', 'didactics', 'exam_makeup')`, undefined, 'assignments_assignable_type_check');
    table.check(`status IN ('active', 'cancelled', 'completed', 'conflict')`, undefined, 'assignments_status_check');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX assignments_no_double_booking
    ON public.assignments (room_id, date, start_time, end_time)
    WHERE status = 'active'
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'assignments',
    'room_requests',
    'audit_logs',
    'settings',
    'time_slots',
    'study_group_grade_groups',
    'special_days',
    'schedule_exceptions',
    'schedules',
    'group_classroom_relations',
    'cycle_default_rooms',
    'classroom_schedules',
    'groups',
    'classrooms',
    'homerooms',
    'grades',
    'cycles',
    'users',
    'rooms',
    'academic_years',
  ];

  for (const tableName of tables) {
    await knex.raw(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
  }

  for (const enumName of Object.keys(enumDefinitions).reverse()) {
    await dropEnumType(knex, enumName);
  }
}
