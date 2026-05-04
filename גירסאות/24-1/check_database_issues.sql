-- בדיקת מניעת כפילויות ובעיות תאריך
-- הרץ את הקובץ הזה ישירות במסד הנתונים

-- 1. בדיקת כפילויות קיימות
SELECT 
    room_id, 
    date, 
    start_time, 
    end_time, 
    COUNT(*) as duplicate_count,
    STRING_AGG(id::text, ', ') as duplicate_ids
FROM assignments 
WHERE status = 'active'
GROUP BY room_id, date, start_time, end_time
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, date;

-- 2. בדיקת שיבוצים עם תאריכים בעייתיים (תאריך עתידי שנשמר בעבר)
SELECT 
    id,
    room_id,
    date,
    start_time,
    end_time,
    created_at,
    CASE 
        WHEN date > CURRENT_DATE THEN 'FUTURE_DATE_ISSUE'
        WHEN date < CURRENT_DATE - INTERVAL '30 days' THEN 'OLD_DATE_ISSUE'
        ELSE 'OK'
    END as date_status
FROM assignments 
WHERE status = 'active'
    AND (
        date > CURRENT_DATE 
        OR date < CURRENT_DATE - INTERVAL '30 days'
    )
ORDER BY date DESC;

-- 3. בדיקת אינדקסים ואילוצים
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'assignments' 
    AND indexname LIKE '%assignments%'
ORDER BY indexname;

-- 4. בדיקת constraint ייחודי
SELECT 
    conname, 
    contype, 
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'assignments'::regclass 
    AND contype = 'u'
ORDER BY conname;

-- 5. ספירת שיבוצים לפי תאריך
SELECT 
    date,
    COUNT(*) as assignments_count
FROM assignments 
WHERE status = 'active'
GROUP BY date 
ORDER BY date DESC 
LIMIT 10;

-- 6. בדיקת שיבוצים שנוצרו היום (אם יש כפילויות אמיתיות)
SELECT 
    COUNT(*) as today_assignments,
    COUNT(DISTINCT room_id || date || start_time || end_time) as unique_slots
FROM assignments 
WHERE status = 'active' 
    AND DATE(created_at) = CURRENT_DATE;
