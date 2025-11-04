#!/bin/bash

# Safe Archive Script for Unused Component Files
# This script moves unused files to an archive folder for safe testing

set -e  # Exit on error

echo "=========================================="
echo "  SAFE FILE ARCHIVING SCRIPT"
echo "=========================================="
echo ""
echo "This script will:"
echo "  1. Create a backup branch"
echo "  2. Create archive folders"
echo "  3. Move unused files to archive (keeps git history)"
echo "  4. Commit the changes"
echo ""
echo "Files to be archived:"
echo "  - app/components/AdminLayout.tsx"
echo "  - app/components/ui/TopNavbarClient.tsx"
echo "  - app/components/Navbar.tsx"
echo "  - app/components/ui/StatisticsCard.tsx"
echo "  - app/components/ChangePasswordModal.tsx"
echo "  - app/components/template/Sidenav.backup.tsx"
echo ""
read -p "Continue? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository!"
    exit 1
fi

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  WARNING: You have uncommitted changes!"
    echo "   Please commit or stash them before running this script."
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
echo ""
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Step 1: Create backup branch
echo "📦 Step 1: Creating backup branch..."
BACKUP_BRANCH="backup-before-cleanup-$(date +%Y%m%d-%H%M%S)"
git checkout -b "$BACKUP_BRANCH" 2>/dev/null || {
    echo "⚠️  Backup branch already exists or could not be created"
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
}
git checkout "$CURRENT_BRANCH"
echo "✓ Backup branch created: $BACKUP_BRANCH"
echo ""

# Step 2: Create archive directories
echo "📁 Step 2: Creating archive directories..."
mkdir -p app/_archive/components/ui
mkdir -p app/_archive/components/template
echo "✓ Archive directories created"
echo ""

# Step 3: Verify files exist before moving
echo "🔍 Step 3: Verifying files exist..."
FILES_TO_MOVE=(
    "app/components/AdminLayout.tsx"
    "app/components/ui/TopNavbarClient.tsx"
    "app/components/Navbar.tsx"
    "app/components/ui/StatisticsCard.tsx"
    "app/components/ChangePasswordModal.tsx"
    "app/components/template/Sidenav.backup.tsx"
)

MISSING_FILES=()
for file in "${FILES_TO_MOVE[@]}"; do
    if [ ! -f "$file" ]; then
        MISSING_FILES+=("$file")
        echo "⚠️  Warning: $file does not exist (may already be deleted)"
    fi
done

if [ ${#MISSING_FILES[@]} -eq ${#FILES_TO_MOVE[@]} ]; then
    echo "❌ All files are already missing! Nothing to archive."
    exit 1
fi

echo "✓ File verification complete"
echo ""

# Step 4: Move files
echo "📦 Step 4: Moving files to archive..."
MOVED_COUNT=0

if [ -f "app/components/AdminLayout.tsx" ]; then
    git mv app/components/AdminLayout.tsx app/_archive/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: AdminLayout.tsx"
fi

if [ -f "app/components/ui/TopNavbarClient.tsx" ]; then
    git mv app/components/ui/TopNavbarClient.tsx app/_archive/components/ui/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: TopNavbarClient.tsx"
fi

if [ -f "app/components/Navbar.tsx" ]; then
    git mv app/components/Navbar.tsx app/_archive/components/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: Navbar.tsx"
fi

if [ -f "app/components/ui/StatisticsCard.tsx" ]; then
    git mv app/components/ui/StatisticsCard.tsx app/_archive/components/ui/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: StatisticsCard.tsx"
fi

if [ -f "app/components/ChangePasswordModal.tsx" ]; then
    git mv app/components/ChangePasswordModal.tsx app/_archive/components/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: ChangePasswordModal.tsx"
fi

if [ -f "app/components/template/Sidenav.backup.tsx" ]; then
    git mv app/components/template/Sidenav.backup.tsx app/_archive/components/template/ && ((MOVED_COUNT++))
    echo "  ✓ Moved: Sidenav.backup.tsx"
fi

echo ""
echo "✓ Moved $MOVED_COUNT file(s)"
echo ""

# Step 5: Commit changes
echo "💾 Step 5: Committing changes..."
git add app/_archive/
git commit -m "Archive unused component files for testing

Archived files:
- AdminLayout.tsx (unused, replaced by app/admin/layout.tsx)
- TopNavbarClient.tsx (unused, replaced by DashboardNavbar)
- Navbar.tsx (unused)
- StatisticsCard.tsx (unused, replaced by SimpleStatisticsCard)
- ChangePasswordModal.tsx (unused)
- Sidenav.backup.tsx (backup file)

Files moved to app/_archive/ for safe testing period.
Can be restored with: git mv app/_archive/* app/components/" || {
    echo "⚠️  Warning: Could not commit (no changes or commit failed)"
    echo "   Files have been moved but not committed"
}

echo ""
echo "=========================================="
echo "  ✅ ARCHIVING COMPLETE!"
echo "=========================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Test your application:"
echo "   npm run build"
echo "   npm run dev"
echo ""
echo "2. Test all pages:"
echo "   - Admin dashboard (/admin)"
echo "   - Client dashboard (/client)"
echo "   - All admin management pages"
echo "   - All client pages"
echo ""
echo "3. If everything works correctly:"
echo "   After testing for a few days/weeks, you can permanently delete:"
echo "   rm -rf app/_archive"
echo "   git add -A"
echo "   git commit -m 'Remove archived unused files'"
echo ""
echo "4. If something breaks, restore files:"
echo "   git mv app/_archive/components/AdminLayout.tsx app/components/"
echo "   git mv app/_archive/components/ui/TopNavbarClient.tsx app/components/ui/"
echo "   git mv app/_archive/components/Navbar.tsx app/components/"
echo "   git mv app/_archive/components/ui/StatisticsCard.tsx app/components/ui/"
echo "   git mv app/_archive/components/ChangePasswordModal.tsx app/components/"
echo "   git mv app/_archive/components/template/Sidenav.backup.tsx app/components/template/"
echo ""
echo "5. Or restore from backup branch:"
echo "   git checkout $BACKUP_BRANCH"
echo ""
echo "Backup branch: $BACKUP_BRANCH"
echo "Current branch: $CURRENT_BRANCH"
echo ""
