#!/usr/bin/env python3
"""
סקריפט ניקוי כפילויות מסיבי
מנקה את כל הכפילויות במערכת ומתקן את הבעיות
"""

import psycopg2
import sys
from datetime import datetime

def connect_to_db():
    """התחברות למסד הנתונים"""
    try:
        conn = psycopg2.connect(
            host="localhost",
            database="your_database",  # שנה את זה!
            user="your_user",          # שנה את זה!
            password="your_password"   # שנה את זה!
        )
        return conn
    except Exception as e:
        print(f"❌ שגיאת התחברות: {e}")
        print("🔧 עדכן את פרטי ההתחברות בסקריפט!")
        sys.exit(1)

def analyze_duplicates(conn):
    """ניתוח כפילויות"""
    print("🔍 מנתח כפילויות...")
    
    with conn.cursor() as cur:
        cur.execute("""
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
            )
            SELECT 
                COUNT(*) as duplicate_groups,
                SUM(duplicate_count) as total_duplicates
            FROM duplicates
        """)
        
        result = cur.fetchone()
        groups, total = result
        
        print(f"📊 נמצאו {groups} קבוצות כפילויות עם {total} שיבוצים כפולים")
        
        if groups == 0:
            print("✅ אין כפילויות! המערכת נקייה!")
            return False
        
        return True

def show_duplicates(conn):
    """הצגת כפילויות"""
    print("\n📋 רשימת כפילויות:")
    
    with conn.cursor() as cur:
        cur.execute("""
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
            )
            SELECT 
                d.duplicate_count,
                d.all_ids,
                d.first_created,
                CONCAT(d.room_id, ' on ', d.assignment_date, ' ', d.start_time, '-', d.end_time) as details
            FROM duplicates d
            ORDER BY d.duplicate_count DESC
        """)
        
        results = cur.fetchall()
        
        for i, (count, ids, created, details) in enumerate(results, 1):
            print(f"\n{i}. 🔄 {count} כפילויות: {details}")
            print(f"   📅 נוצר: {created}")
            print(f"   🆔 מזהים: {ids}")

def cleanup_duplicates(conn, dry_run=True):
    """ניקוי כפילויות"""
    mode = "סימולציה" if dry_run else "ביצוע אמיתי"
    print(f"\n🧹 {mode} ניקוי כפילויות...")
    
    with conn.cursor() as cur:
        # זיהוי מה למחוק
        cur.execute("""
            WITH duplicates AS (
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
            ),
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
            SELECT COUNT(*) as to_delete_count FROM to_delete
        """)
        
        delete_count = cur.fetchone()[0]
        print(f"🗑️  יש למחוק {delete_count} שיבוצים כפולים")
        
        if dry_run:
            print("⚠️  זו סימולציה בלבד! כדי לבצע באמת, הרץ עם --execute")
            return
        
        # ביצוע אמיתי
        print("🚨 מתחיל ניקוי אמיתי...")
        
        cur.execute("""
            WITH duplicates AS (
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
            ),
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
            DELETE FROM assignments WHERE id IN (SELECT id FROM to_delete)
        """)
        
        conn.commit()
        print(f"✅ נמחקו {delete_count} שיבוצים כפולים!")

def create_protection(conn):
    """יצירת הגנה עתידית"""
    print("\n🛡️  יוצר הגנה עתידית...")
    
    with conn.cursor() as cur:
        try:
            # יצירת אינדקס ייחודי
            cur.execute("""
                DROP INDEX IF EXISTS assignments_no_double_booking;
                CREATE UNIQUE INDEX assignments_no_double_booking 
                ON assignments (room_id, DATE(date), start_time, end_time) 
                WHERE status = 'active';
            """)
            conn.commit()
            print("✅ נוצר אינדקס ייחודי למניעת כפילויות")
        except Exception as e:
            print(f"⚠️  בעיה ביצירת אינדקס: {e}")

def main():
    """פונקציה ראשית"""
    print("🚀 סקריפט ניקוי כפילויות מסיבי")
    print("=" * 50)
    
    # בדיקת פרמטרים
    execute = "--execute" in sys.argv
    
    # התחברות
    conn = connect_to_db()
    
    try:
        # ניתוח
        if not analyze_duplicates(conn):
            conn.close()
            return
        
        # הצגת כפילויות
        show_duplicates(conn)
        
        # ניקוי
        cleanup_duplicates(conn, dry_run=not execute)
        
        if execute:
            # הגנה עתידית
            create_protection(conn)
            
            # וידוא סופי
            print("\n🔍 וידוא סופי...")
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM assignments WHERE status = 'active'")
                total = cur.fetchone()[0]
                print(f"📊 סך הכל שיבוצים פעילים: {total}")
        
        print("\n🎉 סיימתי!")
        
    except Exception as e:
        print(f"❌ שגיאה: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main()
