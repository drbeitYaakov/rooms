-- Create proper unique constraint to prevent duplicate assignments
-- First, let's see what columns actually exist in the assignments table
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'assignments' 
ORDER BY ordinal_position;

-- Drop the old incorrect unique constraint if it exists
DROP INDEX IF EXISTS assignments_room_id_start_date_end_date_days_of_week_time_slots_unique;

-- Create a proper unique constraint based on actual business logic
-- This prevents the same room from being assigned to the same time slot on the same date
CREATE UNIQUE INDEX assignments_no_double_booking 
ON assignments (room_id, date, start_time, end_time) 
WHERE status = 'active';

-- Also create an index for faster duplicate checking
CREATE INDEX assignments_duplicate_check 
ON assignments (room_id, date, status, start_time, end_time);

-- Show the new indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'assignments' 
AND indexname LIKE '%assignments%';

-- Test the constraint by trying to find potential duplicates
SELECT 
    room_id, 
    date, 
    start_time, 
    end_time, 
    COUNT(*) as duplicate_count
FROM assignments 
WHERE status = 'active'
GROUP BY room_id, date, start_time, end_time
HAVING COUNT(*) > 1;
