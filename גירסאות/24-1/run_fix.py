// סקריפט פייתון להפעלת התיקון במסד נתונים
// מתחבר למסד נתונים ומפעיל את URGENT_FIX.sql

import psycopg2
import sys
from datetime import datetime

def connect_to_db():
    """התחברות למסד הנתונים"""
    try:
        # נסה עם הגדרות ברירת מחדל נפוצות
        conn = psycopg2.connect(
            host="localhost",
            database="postgres",  # שם ברירת מחדל
            user="postgres",     # שם משתמש ברירת מחדל
            password="password"  # סיסמה ברירת מחדל
        )
        print("✅ התחברות למסד נתונים הצליחה")
        return conn
    except Exception as e:
        print(f"❌ שגיאת התחברות: {e}")
        
        # נסה עם פרטים אחרים
        try:
            conn = psycopg2.connect(
                host="localhost",
                database="scheduling_db",
                user="scheduling_user", 
                password="scheduling_pass"
            )
            print("✅ התחברות למסד נתונים הצליחה (הגדרות אלטרנטיביות)")
            return conn
        except Exception as e2:
            print(f"❌ שגיאת התחברות שנייה: {e2}")
            print("🔧 עדכן את פרטי ההתחברות בסקריפט!")
            return None

def run_fix(conn):
    """הפעלת התיקון"""
    try:
        with conn.cursor() as cur:
            print("🔧 מפעיל תיקון...")
            
            # יצירת אינדקס ייחודי
            cur.execute("""
                DROP INDEX IF EXISTS assignments_no_double_booking;
            """)
            
            cur.execute("""
                CREATE UNIQUE INDEX assignments_no_double_booking 
                ON assignments (room_id, DATE(date), start_time, end_time) 
                WHERE status = 'active';
            """)
            
            conn.commit()
            print("✅ אינדקס ייחודי נוצר בהצלחה!")
            
            # וידוא
            cur.execute("""
                SELECT indexname, indexdef 
                FROM pg_indexes 
                WHERE tablename = 'assignments' 
                    AND indexname = 'assignments_no_double_booking'
            """)
            
            result = cur.fetchone()
            if result:
                print(f"✅ וידוא: אינדקס {result[0]} קיים")
                print(f"📋 הגדרה: {result[1]}")
            else:
                print("❌ אינדקס לא נמצא!")
            
            return True
            
    except Exception as e:
        print(f"❌ שגיאה בהפעלת התיקון: {e}")
        conn.rollback()
        return False

def test_duplicate_prevention(conn):
    """בדיקת מניעת כפילויות"""
    try:
        with conn.cursor() as cur:
            print("\n🧪 בודק מניעת כפילויות...")
            
            # בדיקת כפילויות קיימות
            cur.execute("""
                SELECT 
                    room_id,
                    DATE(date) as assignment_date,
                    start_time,
                    end_time,
                    COUNT(*) as duplicate_count
                FROM assignments 
                WHERE status = 'active'
                GROUP BY room_id, DATE(date), start_time, end_time
                HAVING COUNT(*) > 1
                ORDER BY duplicate_count DESC
                LIMIT 5
            """)
            
            duplicates = cur.fetchall()
            
            if duplicates:
                print(f"📊 נמצאו {len(duplicates)} קבוצות כפילויות:")
                for dup in duplicates:
                    print(f"   - חדר {dup[0]} ב-{dup[1]} {dup[2]}-{dup[3]}: {dup[4]} כפילויות")
            else:
                print("✅ אין כפילויות קיימות!")
            
            # בדיקת סך הכל
            cur.execute("SELECT COUNT(*) FROM assignments WHERE status = 'active'")
            total = cur.fetchone()[0]
            
            cur.execute("""
                SELECT COUNT(DISTINCT room_id || DATE(date) || start_time || end_time) 
                FROM assignments 
                WHERE status = 'active'
            """)
            unique = cur.fetchone()[0]
            
            print(f"📊 סך הכל: {total} שיבוצים, {unique} סלוטים ייחודיים")
            
            if total == unique:
                print("✅ כל השיבוצים ייחודיים!")
            else:
                print(f"⚠️  יש {total - unique} כפילויות!")
            
    except Exception as e:
        print(f"❌ שגיאה בבדיקה: {e}")

def main():
    """פונקציה ראשית"""
    print("🚀 הפעלת תיקון מניעת כפילויות")
    print("=" * 50)
    
    # התחברות
    conn = connect_to_db()
    if not conn:
        print("❌ לא ניתן להתחבר למסד נתונים")
        sys.exit(1)
    
    try:
        # הפעלת התיקון
        if run_fix(conn):
            # בדיקת התוצאות
            test_duplicate_prevention(conn)
            
            print("\n🎉 תיקון הסתיים בהצלחה!")
            print("🛡️  המערכת עכשיו מוגנת מכפילויות!")
        else:
            print("❌ תיקון נכשל")
            
    except Exception as e:
        print(f"❌ שגיאה כללית: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
