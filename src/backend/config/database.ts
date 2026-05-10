import knex from 'knex';
import knexConfig from '../../../knexfile';

const environment = process.env.NODE_ENV || 'development';

export const config = knexConfig;
export const db = knex(config[environment as keyof typeof config]);

db.on('query-error', (error, query) => {
  console.error('❌ Database query error:', {
    message: error.message,
    code: (error as NodeJS.ErrnoException).code,
    sql: query?.sql,
    bindings: query?.bindings
  });
});

db.on('query', (query) => {
  if (process.env.LOG_DB_QUERIES === 'true') {
    console.log('🟦 Database query:', {
      sql: query.sql,
      bindings: query.bindings
    });
  }
});

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

// Graceful shutdown
export const closeConnection = async (): Promise<void> => {
  await db.destroy();
  console.log('📴 Database connection closed');
};

export default db;
