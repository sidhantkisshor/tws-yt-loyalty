#!/bin/bash

# YT Loyalty - Vercel Environment Variables Setup
# This script helps set up environment variables in Vercel

set -e  # Exit on error

echo "🔧 YT Loyalty - Vercel Environment Variables Setup"
echo "=================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Link to Vercel project
print_info "Linking to Vercel project..."
vercel link

# Function to set environment variable
set_env_var() {
    local var_name=$1
    local var_desc=$2
    local environments=$3  # "production", "preview", or "production preview"

    echo ""
    print_info "Setting: $var_name"
    echo "Description: $var_desc"
    read -p "Enter value (or press Enter to skip): " var_value

    if [ -n "$var_value" ]; then
        if [[ $environments == *"production"* ]]; then
            vercel env add "$var_name" production <<< "$var_value" 2>/dev/null || echo "(already set or error)"
        fi
        if [[ $environments == *"preview"* ]]; then
            vercel env add "$var_name" preview <<< "$var_value" 2>/dev/null || echo "(already set or error)"
        fi
        print_success "$var_name configured"
    else
        print_warning "$var_name skipped"
    fi
}

echo ""
echo "This script will help you configure environment variables for Vercel."
echo "You can also set these manually in the Vercel dashboard:"
echo "https://vercel.com/dashboard → Your Project → Settings → Environment Variables"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

# Required variables
echo ""
echo "=== REQUIRED VARIABLES ==="

set_env_var "DATABASE_URL" "PostgreSQL connection string (with connection pooling)" "production preview"
set_env_var "NEXTAUTH_SECRET" "NextAuth.js secret (generate with: openssl rand -base64 32)" "production preview"
set_env_var "NEXTAUTH_URL" "Production URL (e.g., https://your-domain.com)" "production"
set_env_var "GOOGLE_CLIENT_ID" "Google OAuth Client ID" "production preview"
set_env_var "GOOGLE_CLIENT_SECRET" "Google OAuth Client Secret" "production preview"
set_env_var "UPSTASH_REDIS_REST_URL" "Upstash Redis REST URL" "production preview"
set_env_var "UPSTASH_REDIS_REST_TOKEN" "Upstash Redis REST Token" "production preview"

# Sentry (optional but recommended)
echo ""
echo "=== MONITORING (Recommended) ==="

set_env_var "SENTRY_DSN" "Sentry DSN for server-side errors" "production preview"
set_env_var "NEXT_PUBLIC_SENTRY_DSN" "Sentry DSN for client-side errors (public)" "production preview"

# Additional optional variables
echo ""
echo "=== OPTIONAL VARIABLES ==="

set_env_var "SENTRY_ENABLED" "Enable Sentry in preview/dev (true/false)" "preview"

echo ""
print_success "Environment variables configuration complete!"
echo ""
echo "Next steps:"
echo "1. Verify all variables in Vercel dashboard"
echo "2. Run 'npm run deploy' to deploy"
echo "3. Test the deployment"
echo ""
