// סקריפט בדיקה סופי לאחר הניקוי
// בודק שהכל עובד כראוי

const knex = require('./src/backend/config/database');

async function finalVerification() {
  try {
    console.log('🔍 בדיקה סופית של המערכת...');
    console.log('=' .repeat(50));

    // 1. בדיקת כפילויות
    console.log('\n1️⃣ בדיקת כפילויות:');
    const duplicates = await knex('assignments')
      .select(
        knex.raw('room_id'),
        knex.raw('DATE(date) as assignment_date'),
        'start_time',
        'end_time'
      )
      .where('status', 'active')
      .groupBy('room_id', knex.raw('DATE(date)'), 'start_time', 'end_time')
      .havingRaw('COUNT(*) > 1')
      .count('* as duplicate_count');

    if (duplicates.length === 0) {
      console.log('✅ אין כפילויות! מצוין!');
    } else {
      console.log(`❌ עדיין יש ${duplicates.length} קבוצות כפילויות!`);
      duplicates.forEach(dup => {
        console.log(`   - חדר ${dup.room_id} ב-${dup.assignment_date} ${dup.start_time}-${dup.end_time}: ${dup.duplicate_count} כפילויות`);
      });
    }

    // 2. בדיקת אינדקסים
    console.log('\n2️⃣ בדיקת אינדקסים:');
    const indexes = await knex.raw(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'assignments' 
        AND indexname LIKE '%assignments%'
      ORDER BY indexname
    `);

    console.log(`📊 נמצאו ${indexes.rows.length} אינדקסים רלוונטיים:`);
    indexes.rows.forEach(idx => {
      console.log(`   - ${idx.indexname}`);
      if (idx.indexname.includes('unique') || idx.indexname.includes('double_booking')) {
        console.log('     ✅ אינדקס ייחודי למניעת כפילויות');
      }
    });

    // 3. בדיקת סטטיסטיקות
    console.log('\n3️⃣ סטטיסטיקות שיבוצים:');
    const stats = await knex('assignments')
      .where('status', 'active')
      .select(
        knex.raw('COUNT(*) as total_assignments'),
        knex.raw('COUNT(DISTINCT room_id) as unique_rooms'),
        knex.raw('COUNT(DISTINCT DATE(date)) as unique_dates'),
        knex.raw('COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) as unique_slots')
      )
      .first();

    console.log(`📊 סך הכל שיבוצים: ${stats.total_assignments}`);
    console.log(`📊 חדרים ייחודיים: ${stats.unique_rooms}`);
    console.log(`📊 תאריכים ייחודיים: ${stats.unique_dates}`);
    console.log(`📊 סלוטים ייחודיים: ${stats.unique_slots}`);

    // 4. בדיקת תקינות תאריכים
    console.log('\n4️⃣ בדיקת תקינות תאריכים:');
    const dateIssues = await knex('assignments')
      .where('status', 'active')
      .whereRaw('DATE(date) != DATE(created_at)')
      .select('id', 'date', 'created_at', knex.raw('DATE(date) as assignment_date'), knex.raw('DATE(created_at) as created_date'))
      .limit(5);

    if (dateIssues.length === 0) {
      console.log('✅ כל התאריכים תקינים!');
    } else {
      console.log(`⚠️  יש ${dateIssues.length} שיבוצים עם בעיות תאריך:`);
      dateIssues.forEach(issue => {
        console.log(`   - שיבוץ ${issue.id}: תאריך ${issue.assignment_date} != תאריך יצירה ${issue.created_date}`);
      });
    }

    // 5. בדיקת חדרים עם הכי הרבה שיבוצים
    console.log('\n5️⃣ חדרים עם הכי הרבה שיבוצים:');
    const busyRooms = await knex('assignments')
      .where('status', 'active')
      .select('room_id')
      .count('* as assignment_count')
      .groupBy('room_id')
      .orderBy('assignment_count', 'desc')
      .limit(5);

    console.log(`📊 החדרים העסוקים ביותר:`);
    busyRooms.forEach((room, index) => {
      console.log(`   ${index + 1}. חדר ${room.room_id}: ${room.assignment_count} שיבוצים`);
    });

    // 6. בדיקת תפוצה לפי תאריכים
    console.log('\n6️⃣ תפוצת שיבוצים לפי תאריכים:');
    const dateDistribution = await knex('assignments')
      .where('status', 'active')
      .select(knex.raw('DATE(date) as assignment_date'))
      .count('* as assignment_count')
      .groupBy(knex.raw('DATE(date)'))
      .orderBy('assignment_date', 'desc')
      .limit(10);

    console.log(`📊 שיבוצים לפי תאריך (10 אחרונים):`);
    dateDistribution.forEach(item => {
      console.log(`   - ${item.assignment_date}: ${item.assignment_count} שיבוצים`);
    });

    // 7. סיכום כללי
    console.log('\n🎯 סיכום כללי:');
    const isHealthy = duplicates.length === 0 && dateIssues.length === 0;
    
    if (isHealthy) {
      console.log('✅ המערכת בריאה! אין כפילויות והתאריכים תקינים.');
      console.log('🛡️  הגנה מכפילויות פעילה.');
      console.log('🎉 מוכן לעבודה!');
    } else {
      console.log('⚠️  יש בעיות שצריך לטפל בהן:');
      if (duplicates.length > 0) console.log('   - עדיין יש כפילויות');
      if (dateIssues.length > 0) console.log('   - יש בעיות תאריכים');
    }

    console.log('\n🏁 בדיקה הסתיימה!');

  } catch (error) {
    console.error('❌ שגיאה בבדיקה:', error);
    process.exit(1);
  } finally {
    await knex.destroy();
  }
}

finalVerification();
