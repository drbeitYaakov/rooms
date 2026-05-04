-- פתרון מקיף לכפילויות - ניקוי ותיקון מלא
-- הרץ את הקובץ הזה במסד הנתונים

-- שלב 1: גילוי כל הכפילויות
WITH duplicates AS (
    SELECT 
        room_id,
        DATE(date) as assignment_date,
        start_time,
        end_time,
        COUNT(*) as duplicate_count,
        STRING_AGG(id::text, ', ' ORDER BY created_at) as all_ids,
        MIN(created_at) as first_created
    FROM assignments 
    WHERE status = 'active'
    GROUP BY room_id, DATE(date), start_time, end_time
    HAVING COUNT(*) > 1
),
-- שלב 2: זיהוי השיבוצים לשמירה (הראשונים)
to_keep AS (
    SELECT 
        d.room_id,
        d.assignment_date,
        d.start_time,
        d.end_time,
        MIN(a.id) as keep_id
    FROM duplicates d
    JOIN assignments a ON 
        a.room_id = d.room_id AND 
        DATE(a.date) = d.assignment_date AND 
        a.start_time = d.start_time AND 
        a.end_time = d.end_time AND
        a.status = 'active'
    GROUP BY d.room_id, d.assignment_date, d.start_time, d.end_time
),
-- שלב 3: זיהוי השיבוצים למחיקה
to_delete AS (
    SELECT a.id
    FROM assignments a
    JOIN duplicates d ON 
        a.room_id = d.room_id AND 
        DATE(a.date) = d.assignment_date AND 
        a.start_time = d.start_time AND 
        a.end_time = d.end_time AND
        a.status = 'active'
    LEFT JOIN to_keep tk ON 
        a.room_id = tk.room_id AND 
        DATE(a.date) = tk.assignment_date AND 
        a.start_time = tk.start_time AND 
        a.end_time = tk.end_time AND
        a.id = tk.keep_id
    WHERE tk.keep_id IS NULL
)

-- הצגת סיכום לפני המחיקה
SELECT 
    'SUMMARY' as type,
    (SELECT COUNT(*) FROM duplicates) as duplicate_groups,
    (SELECT SUM(duplicate_count) FROM duplicates) as total_duplicates,
    (SELECT COUNT(*) FROM to_keep) as assignments_to_keep,
    (SELECT COUNT(*) FROM to_delete) as assignments_to_delete

UNION ALL

-- הצגת כל הקבוצות של כפילויות
SELECT 
    'DUPLICATE_GROUP' as type,
    d.duplicate_count as count,
    d.all_ids as ids,
    d.first_created as info,
    CONCAT(d.room_id, ' on ', d.assignment_date, ' ', d.start_time, '-', d.end_time) as details
FROM duplicates d

UNION ALL

-- הצגת מה שנשמר ומה שנמחק
SELECT 
    'KEEP_DELETE' as type,
    (SELECT COUNT(*) FROM to_keep) as keep_count,
    (SELECT COUNT(*) FROM to_delete) as delete_count,
    (SELECT COUNT(*) FROM assignments WHERE status = 'active') as total_active,
    'Ready to clean up' as info

ORDER BY type, count DESC;

-- ביצוע הניקוי (הפעל רק אחרי שבדקת את התוצאות למעלה!)
/*
-- אל תריץ את זה אלא אם אתה בטוח!
BEGIN;

-- מחיקת הכפילויות
DELETE FROM assignments 
WHERE id IN (SELECT id FROM to_delete);

-- יצירת אינדקס ייחודי חדש שבאמת ימנע כפילויות
DROP INDEX IF EXISTS assignments_no_double_booking;
CREATE UNIQUE INDEX assignments_no_double_booking 
ON assignments (room_id, DATE(date), start_time, end_time) 
WHERE status = 'active';

-- יצירת לוג של הניקוי
INSERT INTO system_logs (action, details, created_at)
VALUES ('CLEANUP_DUPLICATES', 
        CONCAT('Deleted ', (SELECT COUNT(*) FROM to_delete), ' duplicate assignments, kept ', (SELECT COUNT(*) FROM to_keep), ' unique assignments'),
        NOW());

COMMIT;

-- וידוא התוצאות
SELECT 
    'AFTER_CLEANUP' as status,
    COUNT(*) as total_assignments,
    COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) as unique_slots,
    (SELECT COUNT(*) FROM assignments WHERE status = 'active') as active_assignments
FROM assignments;
*/
