const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_apHqAdu3Uk1G@ep-small-sky-agb0vyap-pooler.c-2.eu-central-1.aws.neon.tech/neondb?sslmode=require'
});

async function createAdmin() {
  try {
    await client.connect();
    
    // Check if admin already exists
    const result = await client.query('SELECT * FROM users WHERE email = $1', ['admin@example.com']);
    
    if (result.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      
      await client.query(`
        INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `, [
        'admin-' + Date.now(),
        'admin@example.com', 
        hashedPassword, 
        'System Administrator',
        'ADMIN',
        true
      ]);
      
      console.log('✅ Admin user created successfully!');
      console.log('📧 Email: admin@example.com');
      console.log('🔑 Password: admin123');
      console.log('🎯 You can now start the application with: npm run dev');
      console.log('🌐 Frontend: http://localhost:3000');
      console.log('🔧 Backend API: http://localhost:3001');
    } else {
      console.log('ℹ️ Admin user already exists');
      console.log('📧 Email: admin@example.com');
      console.log('🔑 Password: admin123 (or your existing password)');
    }
    
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
  } finally {
    await client.end();
  }
}

createAdmin();
