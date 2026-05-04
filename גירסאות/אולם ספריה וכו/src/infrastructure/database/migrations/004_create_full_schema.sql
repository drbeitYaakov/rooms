-- Migration 004: Create full schema for classroom scheduling system

-- Assignment Types
INSERT INTO assignment_types (code, name, description, color) VALUES
('STUDY_GROUP', 'הקבצה', 'הקבצות לימודיות קבועות', '#3B82F6'),
('ONE_ON_ONE', 'פגישה אישית', 'פגישה אחד על אחד', '#10B981'),
('MEETING', 'פגישה', 'פגישות כלליות', '#F59E0B'),
('EVENT', 'אירוע', 'אירועים מיוחדים', '#EF4444'),
('MAKEUP_TEST', 'השלמת מבחן', 'השלמות מבחנים ונוכחות', '#8B5CF6'),
('CAMP_PREP', 'הכנה למחנה', 'הכנות למחנות ופעילויות', '#EC4899'),
('GYMNASTICS', 'התעמלות', 'שיעורי התעמלות', '#06B6D4'),
('LECTURE', 'הרצאה', 'הרצאות ושיחות', '#84CC16');

-- Default Grades
INSERT INTO grades (name) VALUES 
('א'), ('ב'), ('ג'), ('ד'), ('ה'), ('ו');

-- Default Rooms based on requirements
INSERT INTO rooms (room_number, room_type, floor, wing, capacity, has_projector, is_small, comfort_priority, special_notes) VALUES
-- Homerooms
('101', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('102', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('103', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('104', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('105', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('106', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),
('107', 'CLASSROOM_A', 1, 'old', 35, true, false, 2, 'כיתת אם שכבה א'),

('201', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('202', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('203', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('204', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('205', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('206', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),
('207', 'CLASSROOM_B', 2, 'old', 35, true, false, 2, 'כיתת אם שכבה ב'),

('301', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג'),
('302', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג - עדיפות לאנגלית'),
('303', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג'),
('304', 'CLASSROOM_C', 3, 'old', 30, true, true, 1, 'חדר קטן - מקסימום 30 תלמידות'),
('305', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג'),
('306', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג'),
('307', 'CLASSROOM_C', 3, 'old', 35, true, false, 2, 'כיתת אם שכבה ג'),

('401', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד - עתידי'),
('402', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),
('403', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),
('404', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),
('405', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),
('406', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),
('407', 'CLASSROOM_D', 4, 'old', 35, true, false, 2, 'כיתת אם שכבה ד'),

('501', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),
('502', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),
('503', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),
('504', 'CLASSROOM_E', 5, 'old', 30, true, true, 1, 'חדר קטן - מקסימום 30 תלמידות'),
('505', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),
('506', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),
('507', 'CLASSROOM_E', 5, 'old', 35, true, false, 2, 'כיתת אם שכבה ה'),

('601', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('602', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('603', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('604', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('605', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('606', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),
('607', 'CLASSROOM_F', 6, 'old', 35, true, false, 2, 'כיתת אם שכבה ו'),

-- Computer Labs (MMD)
('202', 'computer_lab', 2, 'old', 25, true, false, 0, 'ממ"ד מרכז אגף ישן - עדיפות נמוכה'),
('203', 'computer_lab', 2, 'old', 25, true, false, 0, 'ממ"ד מרכז אגף ישן - עדיפות נמוכה'),
('132', 'computer_lab', 1, 'new', 30, true, false, 0, 'ממ"ד אגף חדש - עדיפות נמוכה'),
('332', 'computer_lab', 3, 'new', 30, true, false, 0, 'ממ"ד אגף חדש - עדיפות נמוכה'),

-- Study Rooms
('401', 'study_room', 4, 'old', 30, false, false, 1, 'חדר הקבצה'),
('402', 'study_room', 4, 'old', 30, false, false, 1, 'חדר הקבצה'),
('403', 'study_room', 4, 'old', 30, false, false, 1, 'חדר הקבצה'),

-- Music Room
('501', 'music_room', 5, 'old', 25, false, false, 1, 'חדר מוזיקה'),

-- Auditorium
('001', 'auditorium', 0, 'old', 200, true, false, 3, 'אולם גדול - שמור להתעמלות ושנה ג'),

-- Library
('301', 'library', 3, 'old', 40, true, false, 2, 'ספריה'),

-- Corridors (for temporary assignments)
('213', 'corridor', 2, 'old', 15, false, true, 0, 'קרוון קומה 2'),
('313', 'corridor', 3, 'old', 15, false, true, 0, 'קרוון קומה 3');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assignments_room_date_time ON assignments(room_id, date, start_time);
CREATE INDEX IF NOT EXISTS idx_assignments_date ON assignments(date);
CREATE INDEX IF NOT EXISTS idx_assignments_status ON assignments(status);
CREATE INDEX IF NOT EXISTS idx_assignments_conflict_check ON assignments(date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_study_groups_grade ON study_groups(grade_level);
CREATE INDEX IF NOT EXISTS idx_group_schedules_group ON group_schedules(group_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);

-- Create function to check room conflicts
CREATE OR REPLACE FUNCTION check_room_conflict(
    p_room_id INTEGER,
    p_date DATE,
    p_start_time TIME,
    p_end_time TIME,
    p_assignment_id INTEGER DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    conflict_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO conflict_count
    FROM assignments
    WHERE room_id = p_room_id
      AND date = p_date
      AND status = 'scheduled'
      AND (
          (start_time <= p_start_time AND end_time > p_start_time) OR
          (start_time < p_end_time AND end_time >= p_end_time) OR
          (start_time >= p_start_time AND end_time <= p_end_time)
      )
      AND (p_assignment_id IS NULL OR id != p_assignment_id);
    
    RETURN conflict_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (action, table_name, record_id, new_values)
        VALUES ('INSERT', TG_TABLE_NAME, NEW.id, row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values)
        VALUES ('UPDATE', TG_TABLE_NAME, NEW.id, row_to_json(OLD), row_to_json(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values)
        VALUES ('DELETE', TG_TABLE_NAME, OLD.id, row_to_json(OLD));
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Add audit triggers to important tables
CREATE TRIGGER audit_assignments
    AFTER INSERT OR UPDATE OR DELETE ON assignments
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_homerooms
    AFTER INSERT OR UPDATE OR DELETE ON homerooms
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_study_groups
    AFTER INSERT OR UPDATE OR DELETE ON study_groups
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
