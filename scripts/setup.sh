#!/bin/bash

# ==========================================
# XRules Setup Script
# ==========================================

set -e

echo "🚀 XRules Setup"
echo "=========================================="

# Start PostgreSQL
echo "🐘 Starting PostgreSQL..."
docker-compose up -d postgres

# Wait for PostgreSQL
echo "Waiting for PostgreSQL..."
until docker exec xrules-postgres pg_isready -U xrules &>/dev/null; do
    sleep 1
done
echo "✅ PostgreSQL is ready!"

# Setup xrules-studio
echo ""
echo "📦 Setting up xrules-studio..."
cd apps/xrules-studio

# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Push schema to database
npx prisma db push

# Seed database
npx prisma db seed 2>/dev/null || echo "Note: Seed skipped"

echo ""
echo "=========================================="
echo "✨ Setup Complete!"
echo "=========================================="
echo ""
echo "Start development:"
echo "   cd apps/xrules-studio && npm run dev"
echo ""
