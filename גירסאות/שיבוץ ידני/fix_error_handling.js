// תיקון פשוט - הוספת try-catch סביב ה-insert
// מתמקד בתפיסת unique constraint violation והחזרת 409

console.log('🔧 מוסיף תפיסת שגיאות למניעת כפילויות...');

// קרא את הקובץ הנוכחי
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/backend/api/routes/assignments.ts');
let content = fs.readFileSync(filePath, 'utf8');

// מצא את מיקום ה-insert והוסף try-catch
const insertPattern = /const \[savedAssignment\] = await db\('assignments'\)\.insert\(\{[\s\S]*?\}\)\.returning\('\*'\);/;

if (insertPattern.test(content)) {
  const newInsert = `let savedAssignment;
    try {
      [savedAssignment] = await db('assignments').insert({
        type: 'one_time',
        assignable_type: result.assignment.assignable_type === 'manual' ? 'meeting' : result.assignment.assignable_type,
        assignable_id: result.assignment.assignable_id,
        room_id: result.assignment.room_id,
        activity_type: result.assignment.activity_type || 'meeting',
        created_by: req.user!.id,
        start_date: normalizedDate,
        date: normalizedDate,
        start_time: result.assignment.start_time,
        end_time: result.assignment.end_time,
        days_of_week: JSON.stringify(result.assignment.daysOfWeek || []),
        time_slots: JSON.stringify(result.assignment.timeSlots || [{ start: result.assignment.start_time, end: result.assignment.end_time }]),
        is_manual: true,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).returning('*');
    } catch (error: any) {
      // Check if it's a unique constraint violation
      if (error.code === '23505' && error.constraint === 'assignments_no_double_booking') {
        console.log('🚫 BLOCKING: Unique constraint violation - duplicate assignment detected');
        return res.status(409).json({
          success: false,
          error: 'קיים כבר שיבוץ לחדר זה בזמן המבוקש',
          conflicts: []
        });
      }
      
      // Re-throw other errors
      throw error;
    }`;

  content = content.replace(insertPattern, newInsert);
  
  // שמור את הקובץ המתוקן
  fs.writeFileSync(filePath, content);
  console.log('✅ קובץ assignments.ts עודכן בהצלחה!');
  console.log('📋 עכשיו נסה ליצור כפילות - זה אמור להחזיר 409!');
} else {
  console.log('❌ לא נמצא את תבנית ה-insert לתיקון');
}
