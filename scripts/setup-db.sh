#!/bin/bash
# Continuum Database Setup
# Run this script to apply all migrations to your Supabase database.
#
# Prerequisites:
#   1. supabase CLI installed (brew install supabase/tap/supabase)
#   2. Logged in to Supabase (supabase login)
#
# Usage:
#   chmod +x scripts/setup-db.sh
#   ./scripts/setup-db.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Continuum — Database Migration Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

PROJECT_REF="gveeqjasymjjsgjqjtqe"

# Check if supabase CLI is available
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with:"
    echo "   brew install supabase/tap/supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "🔑 Not logged in to Supabase. Running login..."
    supabase login
fi

# Link project if not already linked
if [ ! -f "supabase/.temp/project-ref" ] || [ "$(cat supabase/.temp/project-ref 2>/dev/null)" != "$PROJECT_REF" ]; then
    echo "🔗 Linking to project $PROJECT_REF..."
    supabase link --project-ref "$PROJECT_REF"
fi

# Push migrations
echo ""
echo "📦 Pushing migrations..."
supabase db push

echo ""
echo "✅ All migrations applied successfully!"
echo ""
echo "Next steps:"
echo "  1. Deploy to Vercel: vercel --prod"
echo "  2. Set environment variables in Vercel dashboard"
echo "  3. Capture your first life stream event"
