// סקריפט פשוט להפעלת התיקון עם knex
// משתמש ב-knex שכבר קיים בפרויקט

console.log('🚀 הפעלת תיקון מניעת כפילויות');
console.log('='.repeat(50));

try {
  // נסה לטעון את knex
  const knex = require('./src/backend/config/database.ts');
  
  async function runFix() {
    try {
      console.log('🔧 מפעיל תיקון...');
      
      // יצירת אינדקס ייחודי
      await knex.raw('DROP INDEX IF EXISTS assignments_no_double_booking');
      
      await knex.raw(`
        CREATE UNIQUE INDEX assignments_no_double_booking 
        ON assignments (room_id, DATE(date), start_time, end_time) 
        WHERE status = 'active'
      `);
      
      console.log('✅ אינדקס ייחודי נוצר בהצלחה!');
      
      // וידוא
      const result = await knex.raw(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = 'assignments' 
          AND indexname = 'assignments_no_double_booking'
      `);
      
      if (result.rows && result.rows.length > 0) {
        console.log(`✅ וידוא: אינדקס ${result.rows[0].indexname} קיים`);
        console.log(`📋 הגדרה: ${result.rows[0].indexdef}`);
      } else {
        console.log('❌ אינדקס לא נמצא!');
      }

      // בדיקת כפילויות
      console.log('\n🧪 בודק מניעת כפילויות...');
      
      const duplicates = await knex('assignments')
        .select(
          'room_id',
          knex.raw('DATE(date) as assignment_date'),
          'start_time',
          'end_time'
        )
        .where('status', 'active')
        .groupBy('room_id', knex.raw('DATE(date)'), 'start_time', 'end_time')
        .havingRaw('COUNT(*) > 1')
        .count('* as duplicate_count')
        .orderBy('duplicate_count', 'desc')
        .limit(5);
      
      if (duplicates.length > 0) {
        console.log(`📊 נמצאו ${duplicates.length} קבוצות כפילויות:`);
        duplicates.forEach(dup => {
          console.log(`   - חדר ${dup.room_id} ב-${dup.assignment_date} ${dup.start_time}-${dup.end_time}: ${dup.duplicate_count} כפילויות`);
        });
      } else {
        console.log('✅ אין כפילויות קיימות!');
      }
      
      // בדיקת סטטיסטיקות
      const totalResult = await knex('assignments').where('status', 'active').count('* as total');
      const uniqueResult = await knex('assignments')
        .where('status', 'active')
        .select(knex.raw('COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) as unique_slots'))
        .first();
      
      const total = parseInt(totalResult[0].total);
      const unique = parseInt(uniqueResult.unique_slots);
      
      console.log(`📊 סך הכל: ${total} שיבוצים, ${unique} סלוטים ייחודיים`);
      
      if (total === unique) {
        console.log('✅ כל השיבוצים ייחודיים!');
      } else {
        console.log(`⚠️  יש ${total - unique} כפילויות!`);
      }

      console.log('\n🎉 תיקון הסתיים בהצלחה!');
      console.log('🛡️  המערכת עכשיו מוגנת מכפילויות!');
      console.log('\n📋 עכשיו נסה ליצור כפילות במערכת - זה אמור לחסום!');
      
    } catch (error) {
      console.error('❌ שגיאה בהפעלת התיקון:', error.message);
      console.error('📋 פרטים:', error);
    } finally {
      await knex.destroy();
    }
  }
  
  runFix();
  
} catch (error) {
  console.error('❌ לא ניתן לטעון את knex:', error.message);
  console.log('\n🔧 פתרונות:');
  console.log('1. ודא שאתה בתיקיית הפרויקט הראשית');
  console.log('2. בדוק שהקובץ src/backend/config/database.js קיים');
  console.log('3. נסה להפעיל את URGENT_FIX.sql ישירות במסד הנתונים');
  
  console.log('\n📝 הוראות להפעלה ישירה:');
  console.log('1. פתח pgAdmin או psql');
  console.log('2. הפעל את הקובץ URGENT_FIX.sql');
  console.log('3. בדוק שהאינדקס נוצר');
}
