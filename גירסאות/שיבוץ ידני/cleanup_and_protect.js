// סקריפט ניקוי כפילויות ואז יצירת אינדקס
// מנקה קודם את כל הכפילויות ואז מגן מפני עתידיות

console.log('🚀 ניקוי כפילויות והגנה עתידית');
console.log('='.repeat(50));

try {
  const knex = require('knex');
  const knexConfig = require('./knexfile');
  const db = knex(knexConfig.development);
  
  async function cleanupAndProtect() {
    try {
      console.log('🔧 מתחבר למסד נתונים...');
      await db.raw('SELECT 1');
      console.log('✅ התחברות הצליחה!');
      
      // שלב 1: זיהוי כפילויות
      console.log('\n🔍 מזהה כפילויות...');
      
      const duplicates = await db('assignments')
        .select(
          'room_id',
          db.raw('DATE(date) as assignment_date'),
          'start_time',
          'end_time'
        )
        .where('status', 'active')
        .groupBy('room_id', db.raw('DATE(date)'), 'start_time', 'end_time')
        .havingRaw('COUNT(*) > 1')
        .count('* as duplicate_count')
        .orderBy('duplicate_count', 'desc');
      
      if (duplicates.length === 0) {
        console.log('✅ אין כפילויות לנקות!');
      } else {
        console.log(`📊 נמצאו ${duplicates.length} קבוצות כפילויות:`);
        let totalDuplicates = 0;
        
        for (const dup of duplicates) {
          console.log(`   - חדר ${dup.room_id} ב-${dup.assignment_date} ${dup.start_time}-${dup.end_time}: ${dup.duplicate_count} כפילויות`);
          totalDuplicates += parseInt(dup.duplicate_count);
        }
        
        console.log(`📊 סך הכל: ${totalDuplicates} שיבוצים כפולים למחוק`);
        
        // שלב 2: ניקוי כפילויות
        console.log('\n🧹 מנקה כפילויות...');
        
        let deletedCount = 0;
        
        for (const dup of duplicates) {
          // מצא את השיבוץ הראשון (לשמירה)
          const firstAssignment = await db('assignments')
            .where({
              room_id: dup.room_id,
              status: 'active'
            })
            .whereRaw('DATE(date) = ?', [dup.assignment_date])
            .where('start_time', dup.start_time)
            .where('end_time', dup.end_time)
            .orderBy('created_at', 'asc')
            .first();
          
          if (firstAssignment) {
            // מחק את כל השאר
            const deleted = await db('assignments')
              .where({
                room_id: dup.room_id,
                status: 'active'
              })
              .whereRaw('DATE(date) = ?', [dup.assignment_date])
              .where('start_time', dup.start_time)
              .where('end_time', dup.end_time)
              .whereNot('id', firstAssignment.id)
              .del();
            
            deletedCount += deleted;
            console.log(`   ✅ נמחקו ${deleted} כפילויות עבור חדר ${dup.room_id} ב-${dup.assignment_date}`);
          }
        }
        
        console.log(`✅ נמחקו סך הכל ${deletedCount} שיבוצים כפולים!`);
      }
      
      // שלב 3: יצירת אינדקס ייחודי
      console.log('\n🛡️ יוצר הגנה עתידית...');
      
      await db.raw('DROP INDEX IF EXISTS assignments_no_double_booking');
      
      await db.raw(`
        CREATE UNIQUE INDEX assignments_no_double_booking 
        ON assignments (room_id, DATE(date), start_time, end_time) 
        WHERE status = 'active'
      `);
      
      console.log('✅ אינדקס ייחודי נוצר בהצלחה!');
      
      // שלב 4: וידוא סופי
      console.log('\n🔍 וידוא סופי...');
      
      const finalTotal = await db('assignments').where('status', 'active').count('* as total');
      const finalUnique = await db('assignments')
        .where('status', 'active')
        .select(db.raw('COUNT(DISTINCT room_id::text || DATE(date) || start_time || end_time) as unique_slots'))
        .first();
      
      const total = parseInt(finalTotal[0].total);
      const unique = parseInt(finalUnique.unique_slots);
      
      console.log(`📊 סך הכל: ${total} שיבוצים, ${unique} סלוטים ייחודיים`);
      
      if (total === unique) {
        console.log('✅ כל השיבוצים ייחודיים!');
      } else {
        console.log(`⚠️  יש עדיין ${total - unique} כפילויות!`);
      }

      console.log('\n🎉 ניקוי והגנה הסתיימו בהצלחה!');
      console.log('🛡️  המערכת עכשיו מוגנת מכפילויות!');
      console.log('\n📋 עכשיו נסה ליצור כפילות במערכת - זה אמור לחסום!');
      console.log('📝 הפעל את השרת ונסה ליצור אותו שיבוץ פעמיים!');
      console.log('🚫 המערכת צריכה לחסום את הניסיון השני עם שגיאה 409!');
      
    } catch (error) {
      console.error('❌ שגיאה:', error.message);
    } finally {
      await db.destroy();
    }
  }
  
  cleanupAndProtect();
  
} catch (error) {
  console.error('❌ לא ניתן לטעון את knex:', error.message);
}
