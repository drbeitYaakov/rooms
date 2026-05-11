# מבנה מסד נתונים - מערכת שיבוץ כיתות וקבוצות

## טבלאות מרכזיות

### 1. Users (משתמשים)
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'general', 'grade_coordinator', 'group_coordinator')),
    grade_level VARCHAR(1), -- א-ו לרכזי שכבה
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. Grades (שכבות)
```sql
CREATE TABLE grades (
    id SERIAL PRIMARY KEY,
    name VARCHAR(1) NOT NULL UNIQUE CHECK (name IN ('א', 'ב', 'ג', 'ד', 'ה', 'ו')),
    coordinator_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Rooms (חדרים)
```sql
CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    room_number VARCHAR(10) NOT NULL UNIQUE,
    room_type VARCHAR(20) NOT NULL CHECK (room_type IN (
        'homeroom_a', 'homeroom_b', 'homeroom_c', 'homeroom_d', 'homeroom_e', 'homeroom_f',
        'computer_lab', 'study_room', 'music_room', 'auditorium', 'library', 'corridor'
    )),
    floor INTEGER NOT NULL,
    wing VARCHAR(10) NOT NULL CHECK (wing IN ('old', 'new')),
    capacity INTEGER NOT NULL,
    has_projector BOOLEAN DEFAULT false,
    is_small BOOLEAN DEFAULT false,
    comfort_priority INTEGER DEFAULT 0, -- 0-נמוך, 1-בינוני, 2-גבוה
    special_notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. Homerooms (כיתות אם)
```sql
CREATE TABLE homerooms (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id),
    grade_id INTEGER REFERENCES grades(id),
    class_number INTEGER NOT NULL CHECK (class_number BETWEEN 1 AND 7),
    teacher_id INTEGER REFERENCES users(id),
    max_students INTEGER DEFAULT 40,
    current_students INTEGER DEFAULT 0,
    school_year VARCHAR(10) NOT NULL, -- תשפ"ד
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, school_year)
);
```

### 5. StudyGroups (הקבצות)
```sql
CREATE TABLE study_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    group_type VARCHAR(20) NOT NULL CHECK (group_type IN ('math', 'english', 'didactic', 'other')),
    grade_level VARCHAR(1) NOT NULL,
    student_count INTEGER NOT NULL,
    needs_projector BOOLEAN DEFAULT false,
    is_large_group BOOLEAN DEFAULT false,
    consecutive_hours INTEGER DEFAULT 1, -- למתמטיקה: 2 שעות רצופות
    preferred_room_type VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6. GroupSchedules (לוח זמנים של הקבצות)
```sql
CREATE TABLE group_schedules (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES study_groups(id),
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1=ראשון
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7. GroupHomeroomAssignments (שיוך כיתות אם להקבצות)
```sql
CREATE TABLE group_homeroom_assignments (
    id SERIAL PRIMARY KEY,
    group_id INTEGER REFERENCES study_groups(id),
    homeroom_id INTEGER REFERENCES homerooms(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 8. AssignmentTypes (סוגי שיבוצים)
```sql
CREATE TABLE assignment_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#000000' -- לתצוגה בלוח
);
```

### 9. Assignments (שיבוצים)
```sql
CREATE TABLE assignments (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id),
    assignment_type_id INTEGER REFERENCES assignment_types(id),
    assignable_type VARCHAR(20) NOT NULL CHECK (assignable_type IN (
        'study_group', 'one_on_one', 'meeting', 'event', 'makeup_test', 'camp_prep'
    )),
    assignable_id INTEGER NOT NULL, -- מזהה לפי סוג
    title VARCHAR(200) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    requester_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
        'scheduled', 'completed', 'cancelled', 'moved'
    )),
    is_recurring BOOLEAN DEFAULT false,
    recurring_pattern JSONB, -- תבנית חזרה
    special_requirements JSONB, -- דרישות מיוחדות
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 10. TemporaryAssignments (שיבוצים חד-פעמיים)
```sql
CREATE TABLE temporary_assignments (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id),
    assignment_type_id INTEGER REFERENCES assignment_types(id),
    title VARCHAR(200) NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    requester_id INTEGER REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'rejected', 'completed'
    )),
    needs_projector BOOLEAN DEFAULT false,
    is_large_group BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 11. RoomUsageLogs (לוג שימוש בחדרים)
```sql
CREATE TABLE room_usage_logs (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES rooms(id),
    assignment_id INTEGER REFERENCES assignments(id),
    usage_count INTEGER DEFAULT 1,
    log_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 12. Notifications (התראות)
```sql
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN (
        'room_assignment', 'conflict', 'schedule_change', 'maintenance_alert'
    )),
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 13. AuditLogs (יומן ביקורת)
```sql
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50),
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## אינדקסים מומלצים

```sql
-- לחיפוש מהיר של שיבוצים
CREATE INDEX idx_assignments_room_date_time ON assignments(room_id, date, start_time);
CREATE INDEX idx_assignments_date ON assignments(date);
CREATE INDEX idx_assignments_status ON assignments(status);

-- לבדיקת קונפליקטים
CREATE INDEX idx_assignments_conflict_check ON assignments(date, start_time, end_time);

-- להקבצות
CREATE INDEX idx_study_groups_grade ON study_groups(grade_level);
CREATE INDEX idx_group_schedules_group ON group_schedules(group_id);

-- לוגים
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
```

## כללים עסקיים (Business Rules)

### 1. כללי שיבוץ הקבצות
- **עדיפות 1**: כיתות אם פנויות
- **עדיפות 2**: חדרי הקבצה ייעודיים
- **עדיפות 3**: חדרי ממ"ד (132, 332 - עדיפות נמוכה)
- **עדיפות 4**: חדר 302 (עדיפות נמוכה, מועדף לאנגלית)

### 2. כללים מיוחדים
- **מתמטיקה**: 2 שיעורים רצופים, פעמיים בשבוע
- **אנגלית**: מפוזר יותר, עדיפות לאותו חדר
- **שכבה ה'**: אין שיבוץ ביום שני
- **יום שישי**: סיום עד 12:00
- **איסור כפול**: שום חדר לא ישובץ פעמיים באותו זמן

### 3. חוקי חדרים
- **אולם גדול**: שמור להתעמלות ושנה ג' (ראשון ערב)
- **סיפריה**: עדיפות להתעמלות א', ואז שיח וסוגיות
- **חדרי ממ"ד**: לא להקבצות קבועות (אלא אם אין ברירה)
- **חדרים קטנים** (304, 504): מקסימום 30 תלמידות

### 4. התראות אוטומטיות
- אחרי 4 שימושים בחדר → התראה לוועד ניקיון
- שינוי שיבוץ → התראה למורים הרלוונטיים
- קונפליקט זיהוי → התראה למנהל
- אירוע באולם → תזכורת לוועד ניקיון
## עדכון תיעוד - 2026-05-10

### שיבוץ הקבצות - מצב נוכחי
- השיבוץ מתבצע כיום ברמת **חלון זמן מלא** (`date + start_time + end_time`) ולא רק מופע-מופע.
- בתוך כל חלון זמן יש **קדימות לקבוצות גדולות** לפני קבוצות קטנות.
- לקבוצות גדולות סדר העדיפויות הוא:
1. כיתת האם של הקבוצה
2. כיתת אם אחרת פנויה
3. חדר הקבצה
4. ממ"ד / חדר מחשבים
5. חדר `302`
6. קרוון
- לקבוצות קטנות סדר העדיפויות הוא:
1. חדר הקבצה
2. כיתת האם של הקבוצה
3. כיתת אם אחרת פנויה
4. ממ"ד / חדר מחשבים
5. חדר `302`
6. קרוון
- חדרים שאינם באחת מהקטגוריות האלה אינם מועמדים רגילים לשיבוץ הקבצות.

### כללי תפוסה חשובים
- אם יש שיבוץ `homeroom` על כיתת אם בשעות חופפות, רק הקבצה שמשויכת לאותה כיתה יכולה להשתמש בה.
- כל הקבצה אחרת תיחסם מאותה כיתה באותו חלון זמן.
- מתבצעת בדיקת זמינות גם בזמן חישוב השיבוץ וגם שוב לפני שמירה למסד הנתונים.
- בעת מעבר חדר של כיתת אם, מועברים לחדר החדש גם שיבוצי `homeroom` העתידיים של הכיתה וגם שיבוצי `study_group` עתידיים שיושבים בפועל בחדר הישן.

### אימות וולידציה
- רוב הוולידציה הבקשתית נעשית כיום בתוך פונקציות ה־route/service עצמן.
- לפני שמירה מתבצע נרמול של תאריכים, שעות ומבני JSON רלוונטיים.
- מסלולי API מוגנים דרך `authMiddleware`, עם בדיקת טוקן והרשאות מול המשתמש הפעיל במסד.
- ב־development יש ניסיון למפות את הטוקן למשתמש אמיתי פעיל במסד, ולא להסתמך רק על payload גולמי.
