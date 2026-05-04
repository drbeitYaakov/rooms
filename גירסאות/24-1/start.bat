@echo off
echo 🚀 Starting Educational Scheduling System...

echo 📊 Checking PostgreSQL...
pg_isready -q >nul 2>&1
if errorlevel 1 (
    echo ❌ PostgreSQL is not running. Please start PostgreSQL first.
    pause
    exit /b 1
)

echo 🔴 Checking Redis...
redis-cli ping >nul 2>&1
if errorlevel 1 (
    echo ❌ Redis is not running. Please start Redis first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 📦 Installing dependencies...
    npm install
)

if not exist "src\frontend\node_modules" (
    echo 📦 Installing frontend dependencies...
    cd src\frontend
    npm install
    cd ..\..
)

echo 🗄️ Running database migrations...
npm run db:migrate

echo 🎯 Starting application...
npm run dev
