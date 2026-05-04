import knex from 'knex';
import knexConfig from '../../../knexfile';

const environment = process.env.NODE_ENV || 'development';

export const config = knexConfig;
export const db = knex(config[environment as keyof typeof config]);

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
