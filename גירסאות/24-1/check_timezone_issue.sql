-- בדיקת timezone ותאריכים במסד הנתונים
-- הרץ את השאילתה הזו כדי לראות איך התאריכים נשמרים בפועל

-- 1. בדיקת עמודות תאריך בטבלת assignments
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'assignments' 
    AND column_name IN ('date', 'created_at', 'updated_at')
ORDER BY column_name;

-- 2. בדיקת דוגמאות אחרונות עם תאריכים מלאים
SELECT 
    id,
    room_id,
    date,
    created_at,
    updated_at,
    start_time,
    end_time,
    CASE 
        WHEN date::date = created_at::date THEN 'SAME_DAY'
        ELSE 'DIFFERENT_DAY'
    END as date_comparison,
    EXTRACT(HOUR FROM created_at) as created_hour,
    EXTRACT(HOUR FROM updated_at) as updated_hour
FROM assignments 
WHERE status = 'active'
ORDER BY created_at DESC 
LIMIT 5;

-- 3. בדיקת timezone של השרת
SHOW timezone;

-- 4. בדיקת הפרשנות של PostgreSQL לתאריך
SELECT 
    '2026-02-24' as input_date,
    '2026-02-24'::date as postgres_date,
    '2026-02-24T22:00:00.000Z'::timestamp as postgres_timestamp,
    EXTRACT(HOUR FROM '2026-02-24T22:00:00.000Z'::timestamp) as extracted_hour;

-- 5. בדיקת אם יש טריגרים או default values שמשנים את התאריך
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_schema = 'public' 
    AND routine_name LIKE '%assignment%'
LIMIT 3;
