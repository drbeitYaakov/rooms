-- פתרון מיידי למניעת שיבוצים בזמנים תפוסים
-- הרץ את זה עכשיו במסד הנתונים

-- 1. בדיקת מצב נוכחי - כמה כפילויות יש עכשיו
SELECT 
    'CURRENT_STATUS' as type,
    COUNT(*) as total_assignments,
    COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) as unique_slots,
    (COUNT(*) - COUNT(DISTINCT room_id || DATE(date) || start_time || end_time)) as duplicates_count
FROM assignments 
WHERE status = 'active'

UNION ALL

-- 2. הצגת כפילויות קיימות
SELECT 
    'DUPLICATES_FOUND' as type,
    COUNT(*) as count,
    STRING_AGG(CONCAT(room_id, ' on ', DATE(date), ' ', start_time, '-', end_time), ' | ') as details,
    'Need cleanup' as action
FROM assignments 
WHERE status = 'active'
GROUP BY room_id, DATE(date), start_time, end_time
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 5;

-- 3. יצירת אינדקס ייחודי מיידי (מנע כפילויות עתידיות)
-- הרץ את זה רק אחרי שראית את התוצאות למעלה!
/*
-- אל תריץ את זה אלא אם אתה בטוח!
BEGIN;

-- מחיקת אינדקסים ישנים
DROP INDEX IF EXISTS assignments_no_double_booking;

-- יצירת אינדקס ייחודי חזק
CREATE UNIQUE INDEX assignments_no_double_booking 
ON assignments (room_id, DATE(date), start_time, end_time) 
WHERE status = 'active';

-- יצירת אינדקס לשיפור ביצועים
CREATE INDEX assignments_duplicate_check 
ON assignments (room_id, DATE(date), status, start_time, end_time);

COMMIT;

-- וידות שהאינדקס נוצר
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'assignments' 
    AND (indexname LIKE '%double_booking%' OR indexname LIKE '%duplicate_check%');
*/
