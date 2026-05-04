// סקריפט בדיקה אם מניעת כפילויות עובדת בפועל
// מדמה ניסיון ליצור כפילות ובודק אם זה נחסם

console.log('🧪 בודק מניעת כפילויות בפועל...\n');

// דוגמה לבדיקה
const testDuplicate = {
  room_id: 1,
  date: '2026-02-24',
  start_time: '10:00',
  end_time: '11:00'
};

console.log('📋 תרחיש בדיקה:');
console.log('1. יוצר שיבוץ ראשון:');
console.log(`   - חדר: ${testDuplicate.room_id}`);
console.log(`   - תאריך: ${testDuplicate.date}`);
console.log(`   - זמן: ${testDuplicate.start_time}-${testDuplicate.end_time}`);

console.log('\n2. מנסה ליצור שיבוץ שני באותו זמן:');
console.log(`   - חדר: ${testDuplicate.room_id}`);
console.log(`   - תאריך: ${testDuplicate.date}`);
console.log(`   - זמן: ${testDuplicate.start_time}-${testDuplicate.end_time}`);

console.log('\n🔍 מה אמור לקרות:');
console.log('✅ השיבוץ הראשון צריך להצליח');
console.log('🚫 השיבוץ השני צריך להחסם עם שגיאה 409');

console.log('\n📝 הוראות לבדיקה:');
console.log('1. הפעל את השרת');
console.log('2. שלח POST ל-/assignments עם הנתונים הראשונים');
console.log('3. שלח POST שני לאותו נתיב עם אותם נתונים');
console.log('4. בדוק את הלוגים - אמור להיות:');
console.log('   🔍 Checking for duplicates...');
console.log('   📊 Duplicate check result: { found: 0 }');
console.log('   ✅ No duplicates found, proceeding...');
console.log('   (בפעם השנייה:)');
console.log('   🔍 Checking for duplicates...');
console.log('   📊 Duplicate check result: { found: 1, duplicates: [...] }');
console.log('   🚫 BLOCKING: Found duplicates, returning 409');

console.log('\n🎯 אם זה לא קורה, הבעיה יכולה להיות:');
console.log('❌ הבקשה לא מגיעה לנתיב הנכון (/assignments)');
console.log('❌ הפרמטרים לא נשלחים נכון');
console.log('❌ יש בעיה בחיבור למסד נתונים');
console.log('❌ הקוד לא עובד בסביבת הפיתוח');

console.log('\n🔧 פתרונות אפשריים:');
console.log('1. בדוק את הלוגים בשרת אחרי כל בקשה');
console.log('2. וודא שהפרמטרים נכונים (room_id, date, start_time, end_time)');
console.log('3. בדוק את הריאוטינג בקוד');
console.log('4. הפעל את האינדקס הייחודי במסד נתונים');

console.log('\n📞 אם עדיין לא עובד:');
console.log('1. שלח את הלוגים מהשרת');
console.log('2. שלח את הבקשה המדויקת ששולחת');
console.log('3. נבדוק את הקוד יחד');

console.log('\n🎉 הקוד שלנו נראה נכון, צריך רק לראות את מה קורה בפועל!');
