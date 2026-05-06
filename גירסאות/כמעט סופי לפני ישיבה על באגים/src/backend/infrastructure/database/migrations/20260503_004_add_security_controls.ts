import { Knex } from 'knex';

const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
  const hasFailedLoginAttempts = await knex.schema.hasColumn(USERS_TABLE, 'failed_login_attempts');
  const hasLockedUntil = await knex.schema.hasColumn(USERS_TABLE, 'locked_until');
  const hasPasswordChangedAt = await knex.schema.hasColumn(USERS_TABLE, 'password_changed_at');
  const hasMfaEnabled = await knex.schema.hasColumn(USERS_TABLE, 'mfa_enabled');
  const hasMfaSecret = await knex.schema.hasColumn(USERS_TABLE, 'mfa_secret');

  await knex.schema.alterTable(USERS_TABLE, (table) => {
    if (!hasFailedLoginAttempts) {
      table.integer('failed_login_attempts').notNullable().defaultTo(0);
    }

    if (!hasLockedUntil) {
      table.timestamp('locked_until').nullable();
    }

    if (!hasPasswordChangedAt) {
      table.timestamp('password_changed_at').nullable();
    }

    if (!hasMfaEnabled) {
      table.boolean('mfa_enabled').notNullable().defaultTo(false);
    }

    if (!hasMfaSecret) {
      table.text('mfa_secret').nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasFailedLoginAttempts = await knex.schema.hasColumn(USERS_TABLE, 'failed_login_attempts');
  const hasLockedUntil = await knex.schema.hasColumn(USERS_TABLE, 'locked_until');
  const hasPasswordChangedAt = await knex.schema.hasColumn(USERS_TABLE, 'password_changed_at');
  const hasMfaEnabled = await knex.schema.hasColumn(USERS_TABLE, 'mfa_enabled');
  const hasMfaSecret = await knex.schema.hasColumn(USERS_TABLE, 'mfa_secret');

  await knex.schema.alterTable(USERS_TABLE, (table) => {
    if (hasFailedLoginAttempts) {
      table.dropColumn('failed_login_attempts');
    }

    if (hasLockedUntil) {
      table.dropColumn('locked_until');
    }

    if (hasPasswordChangedAt) {
      table.dropColumn('password_changed_at');
    }

    if (hasMfaEnabled) {
      table.dropColumn('mfa_enabled');
    }

    if (hasMfaSecret) {
      table.dropColumn('mfa_secret');
    }
  });
}
