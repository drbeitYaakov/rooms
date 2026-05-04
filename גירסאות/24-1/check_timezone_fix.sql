-- בדיקת תיקוני timezone למניעת כפילויות
-- הרץ את הקובץ הזה כדי לוודא שהתיקונים עובדים נכון

-- 1. הדגמה של הבעיה: תאריך עם timezone
SELECT 
    '2026-02-24' as user_input,
    '2026-02-24'::date as user_date,
    '2026-02-23T22:00:00.000Z'::timestamp as db_timestamp,
    '2026-02-23T22:00:00.000Z'::timestamp::date as db_date,
    '2026-02-23T22:00:00.000Z'::timestamp::date = '2026-02-24'::date as dates_match;

-- 2. בדיקת הפונקציה DATE() - הפתרון שלנו
SELECT 
    DATE('2026-02-23T22:00:00.000Z') as from_timestamp,
    DATE('2026-02-24') as from_string,
    DATE('2026-02-23T22:00:00.000Z') = DATE('2026-02-24') as comparison_result;

-- 3. בדיקת שיבוצים אחרונים עם timezone
SELECT 
    id,
    room_id,
    date,
    DATE(date) as date_only,
    created_at,
    DATE(created_at) as created_date,
    start_time,
    end_time,
    CASE 
        WHEN DATE(date) = DATE(created_at) THEN 'SAME_DAY'
        ELSE 'DIFFERENT_DAY'
    END as analysis
FROM assignments 
WHERE status = 'active'
ORDER BY created_at DESC 
LIMIT 5;

-- 4. בדיקת אם יש כפילויות עם timezone issues
SELECT 
    room_id,
    DATE(date) as assignment_date,
    start_time,
    end_time,
    COUNT(*) as count,
    STRING_AGG(id::text, ', ') as duplicate_ids
FROM assignments 
WHERE status = 'active'
GROUP BY room_id, DATE(date), start_time, end_time
HAVING COUNT(*) > 1
ORDER BY count DESC;

-- 5. המלצה לתיקון מבנה הטבלה (אל תריץ אלא אם אתה בטוח!)
/*
-- אם העמודה date היא timestamp או timestamptz, המר אותה ל-DATE
BEGIN;
-- גיבוי
ALTER TABLE assignments RENAME COLUMN date TO date_old;
-- צור עמודה חדשה
ALTER TABLE assignments ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE;
-- העתק נתונים
UPDATE assignments SET date = DATE(date_old);
-- מחק עמודה ישנה
ALTER TABLE assignments DROP COLUMN date_old;
COMMIT;
*/
