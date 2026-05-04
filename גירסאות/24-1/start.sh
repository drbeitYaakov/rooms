#!/bin/bash

echo "🚀 Starting Educational Scheduling System..."

# Check if PostgreSQL is running
echo "📊 Checking PostgreSQL..."
if ! pg_isready -q; then
    echo "❌ PostgreSQL is not running. Please start PostgreSQL first."
    exit 1
fi

# Check if Redis is running
echo "🔴 Checking Redis..."
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis is not running. Please start Redis first."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Install frontend dependencies
if [ ! -d "src/frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd src/frontend && npm install && cd ../..
fi

# Run database migrations
echo "🗄️ Running database migrations..."
npm run db:migrate

# Start the application
echo "🎯 Starting application..."
npm run dev
