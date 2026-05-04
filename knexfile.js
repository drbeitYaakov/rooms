require('dotenv').config();

module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'educational_scheduling',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      charset: 'utf8',
      collation: 'utf8_general_ci'
    },
    migrations: {
      directory: './src/backend/infrastructure/database/migrations',
      tableName: 'knex_migrations',
      disableMigrationsListValidation: true
    },
    seeds: {
      directory: './src/backend/infrastructure/database/seeds'
    }
  },
  
  test: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME + '_test' || 'educational_scheduling_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password'
    },
    migrations: {
      directory: './src/backend/infrastructure/database/migrations',
      tableName: 'knex_migrations',
      disableMigrationsListValidation: true
    },
    seeds: {
      directory: './src/backend/infrastructure/database/seeds'
    }
  },
  
  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    },
    migrations: {
      directory: './src/backend/infrastructure/database/migrations',
      tableName: 'knex_migrations',
      disableMigrationsListValidation: true
    },
    seeds: {
      directory: './src/backend/infrastructure/database/seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
};
