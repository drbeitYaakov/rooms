-- Clean duplicate assignments
-- Keep only the first assignment for each room/time combination

-- First, let's see what duplicates we have
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

-- Delete duplicates, keeping the oldest one (by created_at)
DELETE FROM assignments 
WHERE id NOT IN (
    SELECT MIN(id) 
    FROM assignments 
    WHERE status = 'active'
    GROUP BY room_id, date, start_time, end_time
) AND status = 'active';

-- Show final count
SELECT COUNT(*) as total_active_assignments 
FROM assignments 
WHERE status = 'active';
