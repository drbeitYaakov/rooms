# 🚀 התקנה והפעלה מהירה

## 📋 דרישות מקדימות
- Node.js 18+
- PostgreSQL 13+
- Redis 6+

## ⚡ התקנה מהירה

### 1. הפעלת מסדי נתונים
```bash
# PostgreSQL
sudo service postgresql start

# Redis
redis-server
```

### 2. יצירת מסד נתונים
```sql
CREATE DATABASE educational_scheduling;
CREATE USER scheduler_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE educational_scheduling TO scheduler_user;
```

### 3. התקנת המערכת
```bash
# הפעלה אוטומטית (Windows)
start.bat

# או הפעלה אוטומטית (Linux/Mac)
./start.sh

# או התקנה ידנית
npm install
cd src/frontend && npm install && cd ../..
npm run db:migrate
npm run dev
```

## 🌐 גישה למערכת
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **משתמש ברירת מחדל**: admin@example.com / admin123

## 📁 מבנה הפרויקט
```
├── src/
│   ├── backend/          # שרת Node.js + TypeScript
│   └── frontend/         # אפליקציית Next.js
├── package.json          # תלות וסקריפטים
├── .env.example          # תבנית משתני סביבה
└── README.md             # תיעוד מלא
```

## 🔧 הגדרות סביבה
```bash
cp .env.example .env
# ערוך את .env עם פרטי ההתחברות שלך
```

## ✅ בדיקת פעילות
```bash
# בדיקת חיבור למסד נתונים
npm run db:migrate

# הרצת בדיקות
npm test

# בדיקת lint
npm run lint
```

## 🎯 מצבי הפעלה
- `npm run dev` - מצב פיתוח (שני שרתים)
- `npm run build` - בנייה לייצור
- `npm start` - הפעלה בייצור

## 📞 תמיכה
כל בעיה או שאלה - בדוק את ה-README.md המלא!
