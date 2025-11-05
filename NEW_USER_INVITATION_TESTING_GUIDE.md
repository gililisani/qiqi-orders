# New User Invitation - Complete Testing Guide

## Overview
This guide ensures 100% reliability of the new user invitation flow. Follow these steps to verify everything works correctly.

---

## Pre-Flight Checks

### 1. Environment Variables
Verify these are set in your `.env.local` or production environment:

```bash
# Required for user creation
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Required for email sending
AZURE_TENANT_ID=your_tenant_id
AZURE_CLIENT_ID=your_client_id
AZURE_CLIENT_SECRET=your_client_secret

# Required for correct redirect URLs
NEXT_PUBLIC_SITE_URL=https://yourdomain.com  # or http://localhost:3000 for local
```

**Test Command:**
```bash
# Check if variables are set (don't run this in production with real values)
echo "SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL:0:20}..."
echo "AZURE_TENANT_ID: ${AZURE_TENANT_ID:0:10}..."
```

---

## Step-by-Step Testing Process

### Step 1: Create Test User (Admin Side)

1. **Navigate to User Creation Page:**
   - Go to `/admin/users/new` OR
   - Go to `/admin/companies/[companyId]/users/new`

2. **Fill in the form:**
   - Name: `Test User [Current Date/Time]`
   - Email: Use a **fresh email** you control (Gmail, Outlook, etc.)
   - Company: Select a valid company
   - Enabled: Checked (default)

3. **Click "Create User"**

4. **Verify Success:**
   - ✅ Should redirect to user list or company page
   - ✅ No error messages
   - ✅ Success message (if implemented)

---

### Step 2: Verify Database Records

**In Supabase Dashboard:**

1. **Check Auth Users:**
   - Go to Authentication → Users
   - Find the user by email
   - ✅ User exists
   - ✅ `email_confirmed_at` should NOT be null (we set `email_confirm: true`)
   - ✅ `last_sign_in_at` should be NULL (they haven't logged in yet)
   - ✅ `created_at` should be recent (just now)

2. **Check Clients Table:**
   - Go to Table Editor → `clients`
   - Find user by email
   - ✅ Row exists with matching `id` (same as Auth user ID)
   - ✅ `name`, `email`, `company_id` match what you entered
   - ✅ `enabled` is `true`

---

### Step 3: Check Email Delivery

**Check Email Inbox:**

1. **Location:** Check the email inbox for the address you used
2. **Subject:** Should be: `"Welcome to Qiqi Partners Hub - Set Your Password"`
3. **Content:** Should include:
   - ✅ Welcome message with user's name
   - ✅ Company name
   - ✅ "Set My Password" button
   - ✅ Login email address shown

**If email is missing:**
- Check spam/junk folder
- Check email service logs (Azure/Microsoft Graph)
- Verify `AZURE_*` environment variables are correct
- Check server logs for email sending errors

---

### Step 4: Test Password Setup Link

1. **Click the "Set My Password" button** in the email

2. **Verify URL:**
   - Should redirect to: `[YOUR_SITE_URL]/confirm-password-reset`
   - URL should contain hash fragments: `#access_token=...&type=recovery&...`

3. **Verify Page Loads:**
   - ✅ Page should load without errors
   - ✅ Should show "Set Your Password" form
   - ✅ Should NOT show "Last sign in" timestamp updated in Supabase yet

---

### Step 5: Set Password

1. **Enter Password:**
   - New Password: `TestPassword123!`
   - Confirm Password: `TestPassword123!`
   - Both should match
   - Minimum 6 characters

2. **Click "Set Password"**

3. **Verify Success:**
   - ✅ Should show success message
   - ✅ Should redirect or show "Password set successfully"
   - ✅ Should NOT auto-login (user should be signed out)

---

### Step 6: Verify Password Was Set

**In Supabase Dashboard:**

1. **Check Auth User:**
   - Go back to Authentication → Users
   - Find the user
   - ✅ `last_sign_in_at` should NOW have a timestamp (when they set password)
   - ✅ Password should be set (you can't see it, but it's there)

2. **Verify Session:**
   - The user should NOT be logged in (they were signed out after setting password)

---

### Step 7: Test Login

1. **Go to Login Page:**
   - Navigate to `/` (login page)

2. **Enter Credentials:**
   - Email: The email you used
   - Password: The password you just set

3. **Click "Sign In"**

4. **Verify Success:**
   - ✅ Should successfully log in
   - ✅ Should redirect to `/client` dashboard
   - ✅ Should see user's name and company info

---

### Step 8: Verify "Send Password Setup/Reset Email" (Admin)

1. **Go to Edit User Page:**
   - Navigate to `/admin/users/[userId]/edit` OR
   - Navigate to `/admin/companies/[companyId]/users/[userId]/edit`

2. **Click "Send Password Setup/Reset Email"**

3. **Verify:**
   - ✅ Should show success message
   - ✅ Message should say "Password setup link sent" (for new users)
   - ✅ User should receive email
   - ✅ Email should be welcome email (not reset email) if they never logged in

---

## Common Issues & Solutions

### Issue 1: "Email rate limit exceeded"
**Solution:** This shouldn't happen anymore. We're using Microsoft Graph API, not Supabase email.
- Verify `AZURE_*` environment variables are set
- Check Azure App Registration has email sending permissions

### Issue 2: "Invalid password link" (Outlook/Email Client Issues)
**Solution:** This is the MOST COMMON issue when users receive emails in Outlook.
- **ADMIN ACTION: Resend the link** - Go to the user's edit page and click "Send Password Setup/Reset Email" button
  - Navigate to: `/admin/users/[userId]/edit` OR `/admin/companies/[companyId]/users/[userId]/edit`
  - Scroll to "Password Management" section
  - Click "Send Password Setup/Reset Email" button
  - A fresh link will be sent (the system automatically detects if it's a new user or existing user)
- **USER ACTION (if they contact you):**
  - Ask them to right-click the button in the email and "Copy link address"
  - Paste the full link directly into their browser
  - Or mark `orders@qiqiglobal.com` as a trusted sender in Outlook
- **Alternative:** Check if link expired (24 hours default) - if so, resend

### Issue 3: "User created but email not sent"
**Solution:**
- Check server logs for email sending errors
- Verify Azure credentials are correct
- Check email service quotas/limits
- **ADMIN ACTION:** Manually send the link using "Send Password Setup/Reset Email" button in user edit page

### Issue 4: "Last sign in" shows before password is set
**Solution:** This should be fixed. The session is only created when password is submitted, not when link is clicked.

### Issue 5: User can't log in after setting password
**Solution:**
- Verify password meets requirements (6+ characters)
- Check if user is enabled in database
- Verify user exists in `clients` table

### Issue 6: User says "Link doesn't work" or "Link is broken"
**ADMIN QUICK FIX:**
1. Go to user edit page: `/admin/users/[userId]/edit` (or from company page)
2. Scroll to "Password Management" section
3. Click **"Send Password Setup/Reset Email"** button
4. A new link will be sent immediately
5. Tell the user to check their email (and spam folder)
6. The new link will be fresh and should work

**No code changes needed - this feature is already built in!**

---

## Automated Verification Checklist

Use this checklist every time you test:

- [ ] User created in Supabase Auth
- [ ] User exists in `clients` table
- [ ] `last_sign_in_at` is NULL initially
- [ ] Welcome email received
- [ ] Email has correct subject and content
- [ ] Password setup link works
- [ ] Can set password successfully
- [ ] `last_sign_in_at` updated AFTER password is set
- [ ] User is signed out after setting password
- [ ] User can log in with new password
- [ ] "Send Password Setup/Reset Email" works for new users

---

## Production Deployment Checklist

Before deploying to production:

- [ ] All environment variables are set in production environment
- [ ] `NEXT_PUBLIC_SITE_URL` is set to production domain
- [ ] Azure email service is configured and tested
- [ ] Supabase project has correct redirect URLs configured
- [ ] Test with a real email address
- [ ] Verify email delivery in production
- [ ] Test complete flow end-to-end in production

---

## Monitoring & Logging

### Server Logs to Check:

1. **User Creation:**
   ```
   Welcome email sent successfully to: [email]
   ```

2. **Email Sending Errors:**
   ```
   Failed to send welcome email: [error]
   ```

3. **Link Generation Errors:**
   ```
   Failed to generate password setup link: [error]
   ```

### Supabase Dashboard Checks:

- Monitor Authentication → Users for new signups
- Check `clients` table for new records
- Review email logs (if available)

---

## Quick Test Script

Run this in your browser console after creating a user (replace `USER_EMAIL`):

```javascript
// Check if user exists in Supabase
fetch('/api/user-profile?email=USER_EMAIL')
  .then(r => r.json())
  .then(console.log);
```

---

## Admin Self-Service: Resending Password Links

**If a user reports their password setup link doesn't work, you can resend it yourself:**

### Quick Steps:
1. **Find the user:**
   - Go to `/admin/users` and find the user, OR
   - Go to `/admin/companies/[companyId]` and find the user in the users list

2. **Edit the user:**
   - Click "Edit" on the user
   - OR go directly to `/admin/users/[userId]/edit`

3. **Resend the link:**
   - Scroll down to "Password Management" section
   - Click **"Send Password Setup/Reset Email"** button
   - The system will automatically:
     - Detect if it's a new user (never set password) or existing user
     - Send the appropriate email (Welcome email for new users, Reset email for existing)
     - Generate a fresh, valid link

4. **Notify the user:**
   - Tell them to check their email (including spam folder)
   - The new link will be valid for 24 hours
   - If they still have issues, they can copy/paste the link directly

**This works for both new user invitations and password resets!**

---

## Need Help?

If issues persist:
1. **First:** Try resending the link using the "Send Password Setup/Reset Email" button (see above)
2. Check server logs for detailed error messages (look for `[USER_CREATE]` entries)
3. Verify all environment variables
4. Test email service independently
5. Check Supabase dashboard for user status
6. Verify redirect URLs are whitelisted in Supabase

