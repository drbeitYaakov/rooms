-- יצירת חדרים לדוגמה
INSERT INTO rooms (id, room_number, floor, wing, room_type, has_projector, is_small, capacity, priority, is_active, created_at, updated_at) VALUES
('550e8400-e29b-41d4-a716-446655440000', '101', 1, 'old', 'mamad', true, false, 30, 'normal', true, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440001', '102', 1, 'old', 'mamad', true, false, 30, 'normal', true, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440002', '201', 2, 'old', 'study_group', false, true, 15, 'normal', true, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440003', '301', 3, 'new', 'music', false, false, 25, 'low', true, NOW(), NOW()),
('550e8400-e29b-41d4-a716-446655440004', '401', 4, 'new', 'large_hall', true, false, 100, 'high', true, NOW(), NOW());
