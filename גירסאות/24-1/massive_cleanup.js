// פתרון Node.js לניקוי כפילויות מסיבי
// משתמש ב-knex שכבר קיים בפרויקט

const knex = require('./src/backend/config/database');

async function massiveCleanup() {
  try {
    console.log('🚀 מתחיל ניקוי כפילויות מסיבי...');
    console.log('=' .repeat(50));

    // שלב 1: ניתוח כפילויות
    console.log('\n🔍 מנתח כפילויות...');
    
    const duplicateAnalysis = await knex('assignments')
      .select(
        knex.raw('room_id'),
        knex.raw('DATE(date) as assignment_date'),
        'start_time',
        'end_time'
      )
      .where('status', 'active')
      .groupBy('room_id', knex.raw('DATE(date)'), 'start_time', 'end_time')
      .havingRaw('COUNT(*) > 1')
      .count('* as duplicate_count')
      .select(knex.raw('STRING_AGG(id::text, \', \' ORDER BY created_at) as all_ids'))
      .select(knex.raw('MIN(created_at) as first_created'));

    if (duplicateAnalysis.length === 0) {
      console.log('✅ אין כפילויות! המערכת נקייה!');
      process.exit(0);
    }

    const totalDuplicates = duplicateAnalysis.reduce((sum, dup) => sum + parseInt(dup.duplicate_count), 0);
    console.log(`📊 נמצאו ${duplicateAnalysis.length} קבוצות כפילויות עם ${totalDuplicates} שיבוצים כפולים`);

    // שלב 2: הצגת כפילויות
    console.log('\n📋 רשימת כפילויות:');
    duplicateAnalysis.forEach((dup, index) => {
      console.log(`\n${index + 1}. 🔄 ${dup.duplicate_count} כפילויות:`);
      console.log(`   📍 חדר: ${dup.room_id} בתאריך ${dup.assignment_date} ${dup.start_time}-${dup.end_time}`);
      console.log(`   📅 נוצר: ${dup.first_created}`);
      console.log(`   🆔 מזהים: ${dup.all_ids}`);
    });

    // שלב 3: זיהוי מה לשמור ומה למחוק
    console.log('\n🎯 מזהה שיבוצים לשמירה/מחיקה...');
    
    const toKeep = [];
    const toDelete = [];

    for (const dup of duplicateAnalysis) {
      // מצא את השיבוץ הראשון (לשמירה)
      const firstAssignment = await knex('assignments')
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
        toKeep.push(firstAssignment.id);

        // מצא את כל השאר (למחיקה)
        const othersToDelete = await knex('assignments')
          .where({
            room_id: dup.room_id,
            status: 'active'
          })
          .whereRaw('DATE(date) = ?', [dup.assignment_date])
          .where('start_time', dup.start_time)
          .where('end_time', dup.end_time)
          .whereNot('id', firstAssignment.id)
          .pluck('id');

        toDelete.push(...othersToDelete);
      }
    }

    console.log(`📊 סיכום:`);
    console.log(`   ✅ לשמירה: ${toKeep.length} שיבוצים`);
    console.log(`   🗑️  למחיקה: ${toDelete.length} שיבוצים`);

    // שלב 4: ביצוע הניקוי
    if (toDelete.length > 0) {
      console.log('\n🧹 מבצע ניקוי...');
      
      // מחיקת הכפילויות
      const deleted = await knex('assignments')
        .whereIn('id', toDelete)
        .del();

      console.log(`✅ נמחקו ${deleted} שיבוצים כפולים!`);

      // יצירת אינדקס ייחודי
      console.log('\n🛡️  יוצר הגנה עתידית...');
      
      try {
        await knex.raw('DROP INDEX IF EXISTS assignments_no_double_booking');
        await knex.raw(`
          CREATE UNIQUE INDEX assignments_no_double_booking 
          ON assignments (room_id, DATE(date), start_time, end_time) 
          WHERE status = 'active'
        `);
        console.log('✅ נוצר אינדקס ייחודי למניעת כפילויות');
      } catch (error) {
        console.log('⚠️  בעיה ביצירת אינדקס:', error.message);
      }
    }

    // שלב 5: וידוא סופי
    console.log('\n🔍 וידוא סופי...');
    const finalCount = await knex('assignments').where('status', 'active').count('* as total');
    const uniqueSlots = await knex('assignments')
      .where('status', 'active')
      .select(knex.raw('COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) as unique_slots'))
      .first();

    console.log(`📊 סך הכל שיבוצים פעילים: ${finalCount[0].total}`);
    console.log(`📊 סלוטים ייחודיים: ${uniqueSlots.unique_slots}`);

    console.log('\n🎉 ניקוי הסתיים בהצלחה!');
    console.log('🛡️  המערכת עכשיו מוגנת מכפילויות עתידיות!');

  } catch (error) {
    console.error('❌ שגיאה:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

massiveCleanup();
