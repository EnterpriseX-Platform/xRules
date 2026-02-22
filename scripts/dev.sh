#!/bin/bash

# ==========================================
# XRules Development Script
# ==========================================

echo "🚀 Starting XRules Development"
echo "=========================================="

# Start PostgreSQL if not running
if ! docker ps | grep -q "xrules-postgres"; then
    echo "🐘 Starting PostgreSQL..."
    docker-compose up -d postgres
    sleep 2
fi

echo "✅ PostgreSQL is running"

# Start Next.js
echo ""
echo "🎨 Starting xrules-studio..."
cd apps/xrules-studio
npm run dev
