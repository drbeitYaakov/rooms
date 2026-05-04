-- בדיקת מבנה הטבלה וסוגי העמודות
-- הרץ את זה כדי לראות אם העמודה date היא timestamp או date

-- 1. בדיקת סוג העמודה date
SELECT 
    column_name,
    data_type,
    udt_name,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'assignments' 
    AND column_name = 'date';

-- 2. בדיקת כל העמודות בטבלה
SELECT 
    column_name,
    data_type,
    udt_name
FROM information_schema.columns 
WHERE table_name = 'assignments'
ORDER BY ordinal_position;

-- 3. בדיקת דוגמה אחרונה
SELECT 
    id,
    date,
    date::date as date_only,
    date::time as time_only,
    created_at,
    updated_at
FROM assignments 
WHERE status = 'active'
ORDER BY created_at DESC 
LIMIT 1;

-- 4. הצעת תיקון אם העמודה היא timestamp במקום date
-- אל תריץ את זה אלא אם אתה בטוח!
/*
-- תיקון מצב: הפוך את העמודה date ל-timestamp ל-timestamptz או ל-date
BEGIN;
-- גבה גיבוי
ALTER TABLE assignments RENAME COLUMN date TO date_old;
-- צור עמודה חדשה עם הסוג הנכון
ALTER TABLE assignments ADD COLUMN date DATE NOT NULL;
-- העתק נתונים
UPDATE assignments SET date = date_old::date;
-- מחק עמודה ישנה
ALTER TABLE assignments DROP COLUMN date_old;
COMMIT;
*/
