#!/bin/bash

# YT Loyalty - Production Deployment Script
# This script performs pre-deployment checks and deploys to Vercel

set -e  # Exit on error

echo "🚀 YT Loyalty - Production Deployment Script"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "ℹ $1"
}

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    print_error "Vercel CLI not found. Installing..."
    npm install -g vercel
fi

# Step 1: Pre-deployment checks
echo "Step 1: Running pre-deployment checks..."
echo ""

# Check TypeScript compilation
print_info "Checking TypeScript compilation..."
if npx tsc --noEmit; then
    print_success "TypeScript compilation passed"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# Check environment variables
print_info "Checking environment variables..."
if [ -f .env.local ]; then
    print_success ".env.local file found"
else
    print_warning ".env.local file not found (OK for production)"
fi

# Run linting
print_info "Running ESLint..."
if npm run lint --silent 2>/dev/null || npx next lint; then
    print_success "Linting passed"
else
    print_warning "Linting found issues (continuing anyway)"
fi

# Check for uncommitted changes
print_info "Checking for uncommitted changes..."
if git diff-index --quiet HEAD --; then
    print_success "No uncommitted changes"
else
    print_warning "You have uncommitted changes. Consider committing them first."
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Deployment cancelled"
        exit 1
    fi
fi

echo ""
echo "Step 2: Pre-deployment checklist"
echo ""

# Checklist
checklist=(
    "Database connection string configured in Vercel?"
    "Google OAuth credentials configured in Vercel?"
    "Redis (Upstash) credentials configured in Vercel?"
    "Sentry DSN configured in Vercel?"
    "NEXTAUTH_SECRET generated and configured?"
    "NEXTAUTH_URL set to production domain?"
    "Google OAuth redirect URIs updated for production?"
    "Database migrations applied to production database?"
)

all_confirmed=true
for item in "${checklist[@]}"; do
    read -p "$item (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        all_confirmed=false
        print_error "Please complete: $item"
    fi
done

if [ "$all_confirmed" = false ]; then
    print_error "Pre-deployment checklist incomplete"
    echo ""
    echo "Please complete all checklist items and try again."
    echo "See DEPLOYMENT_GUIDE.md for details."
    exit 1
fi

print_success "Pre-deployment checklist complete"
echo ""

# Step 3: Choose deployment type
echo "Step 3: Choose deployment type"
echo ""
echo "1) Deploy to preview (staging)"
echo "2) Deploy to production"
echo ""
read -p "Enter your choice (1 or 2): " -n 1 -r
echo ""

if [[ $REPLY == "1" ]]; then
    print_info "Deploying to preview environment..."
    vercel --confirm
    print_success "Preview deployment complete!"
    echo ""
    echo "View your deployment at the URL provided above."

elif [[ $REPLY == "2" ]]; then
    print_warning "⚠️  PRODUCTION DEPLOYMENT"
    echo ""
    echo "This will deploy to production and affect live users."
    read -p "Are you absolutely sure? (yes/no) " -r
    echo ""

    if [[ $REPLY == "yes" ]]; then
        print_info "Deploying to production..."
        vercel --prod --confirm
        print_success "Production deployment complete!"
        echo ""
        echo "=============================================="
        echo "🎉 Deployment successful!"
        echo "=============================================="
        echo ""
        echo "Post-deployment checklist:"
        echo "1. Visit production URL and verify homepage loads"
        echo "2. Check /api/health/full endpoint"
        echo "3. Test admin login"
        echo "4. Test viewer login"
        echo "5. Check Sentry dashboard for errors"
        echo "6. Monitor for 15-30 minutes"
        echo ""
        echo "Rollback if needed:"
        echo "  vercel rollback <deployment-url>"
        echo ""
    else
        print_error "Production deployment cancelled"
        exit 1
    fi
else
    print_error "Invalid choice"
    exit 1
fi
