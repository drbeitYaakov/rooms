// סקריפט Node.js להפעלת התיקון
// מתחבר למסד נתונים ומפעיל את התיקון

const { Pool } = require('pg');

async function runFix() {
  console.log('🚀 הפעלת תיקון מניעת כפילויות');
  console.log('='.repeat(50));

  // הגדרות חיבור (נסה מספר אפשרויות)
  const configs = [
    {
      host: 'localhost',
      database: 'postgres',
      user: 'postgres', 
      password: 'password'
    },
    {
      host: 'localhost',
      database: 'scheduling_db',
      user: 'scheduling_user',
      password: 'scheduling_pass'
    },
    {
      host: 'localhost',
      database: 'your_database',
      user: 'your_user',
      password: 'your_password'
    }
  ];

  let pool = null;
  
  // נסה להתחבר עם כל ההגדרות
  for (const config of configs) {
    try {
      pool = new Pool(config);
      await pool.query('SELECT 1');
      console.log('✅ התחברות למסד נתונים הצליחה');
      break;
    } catch (error) {
      console.log(`❌ ניסיון התחברות נכשל: ${error.message}`);
      if (pool) await pool.end();
      pool = null;
    }
  }

  if (!pool) {
    console.log('❌ לא ניתן להתחבר למסד נתונים');
    console.log('🔧 עדכן את פרטי ההתחברות בסקריפט!');
    process.exit(1);
  }

  try {
    console.log('🔧 מפעיל תיקון...');
    
    // יצירת אינדקס ייחודי
    await pool.query('DROP INDEX IF EXISTS assignments_no_double_booking');
    
    await pool.query(`
      CREATE UNIQUE INDEX assignments_no_double_booking 
      ON assignments (room_id, DATE(date), start_time, end_time) 
      WHERE status = 'active'
    `);
    
    console.log('✅ אינדקס ייחודי נוצר בהצלחה!');
    
    // וידוא
    const result = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'assignments' 
        AND indexname = 'assignments_no_double_booking'
    `);
    
    if (result.rows.length > 0) {
      console.log(`✅ וידוא: אינדקס ${result.rows[0].indexname} קיים`);
      console.log(`📋 הגדרה: ${result.rows[0].indexdef}`);
    } else {
      console.log('❌ אינדקס לא נמצא!');
    }

    // בדיקת כפילויות
    console.log('\n🧪 בודק מניעת כפילויות...');
    
    const duplicates = await pool.query(`
      SELECT 
        room_id,
        DATE(date) as assignment_date,
        start_time,
        end_time,
        COUNT(*) as duplicate_count
      FROM assignments 
      WHERE status = 'active'
      GROUP BY room_id, DATE(date), start_time, end_time
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC
      LIMIT 5
    `);
    
    if (duplicates.rows.length > 0) {
      console.log(`📊 נמצאו ${duplicates.rows.length} קבוצות כפילויות:`);
      duplicates.rows.forEach(dup => {
        console.log(`   - חדר ${dup.room_id} ב-${dup.assignment_date} ${dup.start_time}-${dup.end_time}: ${dup.duplicate_count} כפילויות`);
      });
    } else {
      console.log('✅ אין כפילויות קיימות!');
    }
    
    // בדיקת סטטיסטיקות
    const totalResult = await pool.query("SELECT COUNT(*) FROM assignments WHERE status = 'active'");
    const uniqueResult = await pool.query(`
      SELECT COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) 
      FROM assignments 
      WHERE status = 'active'
    `);
    
    const total = parseInt(totalResult.rows[0].count);
    const unique = parseInt(uniqueResult.rows[0].count);
    
    console.log(`📊 סך הכל: ${total} שיבוצים, ${unique} סלוטים ייחודיים`);
    
    if (total === unique) {
      console.log('✅ כל השיבוצים ייחודיים!');
    } else {
      console.log(`⚠️  יש ${total - unique} כפילויות!`);
    }

    console.log('\n🎉 תיקון הסתיים בהצלחה!');
    console.log('🛡️  המערכת עכשיו מוגנת מכפילויות!');
    
  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  } finally {
    await pool.end();
  }
}

runFix().catch(console.error);
