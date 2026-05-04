-- תיקון מיידי - הפעל את זה במסד הנתונים עכשיו!

-- יצירת אינדקס ייחודי שבאמת ימנע כפילויות
BEGIN;

-- מחיקת אינדקסים ישנים
DROP INDEX IF EXISTS assignments_no_double_booking;

-- יצירת אינדקס ייחודי חזק
CREATE UNIQUE INDEX assignments_no_double_booking 
ON assignments (room_id, DATE(date), start_time, end_time) 
WHERE status = 'active';

COMMIT;

-- וידוא שהאינדקס נוצר
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'assignments' 
    AND indexname = 'assignments_no_double_booking';
