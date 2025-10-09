# 📧 Email Notification System - Setup Guide

## ✅ What's Been Implemented

The automatic email notification system is now **fully implemented** and ready to use! Here's what you have:

### 🎯 Automatic Email Triggers
1. **Order Created** → Welcome email with order details
2. **Status → "In Process"** → Processing notification (with Sales Order number if available)
3. **Status → "Ready"** → Pickup notification (with pickup address)
4. **Status → "Cancelled"** → Cancellation notice

### 🎨 Beautiful HTML Email Templates
- Professional design with your QIQI logo
- Responsive (looks great on mobile)
- Clear order information
- Action buttons to view order details
- Branded footer

### 👨‍💼 Admin Manual Control
- **"Send Update" button** in order details page
- Custom message input
- Email preview before sending
- Shows recipient, subject, and order status

---

## 🔐 Setup Instructions

### Step 1: Add Environment Variables

You need to add these to your `.env.local` file (create it if it doesn't exist):

```bash
# Email Configuration (Microsoft 365 SMTP via OAuth)
AZURE_TENANT_ID=your_azure_tenant_id_here
AZURE_CLIENT_ID=your_azure_client_id_here
AZURE_CLIENT_SECRET=your_azure_client_secret_here
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_FROM=orders@qiqiglobal.com

# Site URL (for email links - update for production)
NEXT_PUBLIC_SITE_URL=https://orders.qiqiglobal.com
```

> **Note**: The actual credentials have been provided to you separately. Add them to your local `.env.local` file.

> **Important**: Update `NEXT_PUBLIC_SITE_URL` to your actual production URL!

### Step 2: Configure Azure App Permissions

Your Azure App Registration needs the **SMTP.SendAsApp** permission:

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App Registrations**
3. Find your app: **QIQI Orders Email**
4. Click **API Permissions** → **Add a permission**
5. Select **APIs my organization uses** → Search for **Office 365 Exchange Online**
6. Choose **Application permissions**
7. Select **SMTP.SendAsApp**
8. Click **Add permissions**
9. **Important**: Click **Grant admin consent** (you'll see a green checkmark when done)

### Step 3: Enable Authenticated SMTP

Make sure your Microsoft 365 organization allows authenticated SMTP:

1. Go to [Microsoft 365 Admin Center](https://admin.microsoft.com)
2. Navigate to **Exchange Admin Center**
3. Go to **Mail flow** → **Connectors**
4. Ensure authenticated SMTP is enabled

### Step 4: Test the System

Run the test script to verify everything works:

```bash
npx ts-node scripts/test-mail.ts your-email@example.com
```

You should see:
```
✅ Email sent successfully!
📨 Message ID: <...>
📬 Sent to: your-email@example.com
✨ SMTP configuration is working correctly!
```

---

## 🚀 How It Works

### For Order Creation
When a customer places an order:
1. Order is saved to database
2. Email is **automatically sent** to customer's email
3. Customer receives "Thank You" email with order details
4. Process is **non-blocking** (order creation doesn't wait for email)

### For Status Changes
When admin changes order status:
1. Status is updated in database
2. If status is "In Process", "Ready", or "Cancelled":
   - Email is **automatically sent** to customer
3. Customer receives notification about the change
4. Process is **non-blocking** (status update doesn't wait for email)

### For Manual Updates
When admin clicks "Send Update":
1. Modal opens with custom message input
2. Admin types custom message (optional)
3. Admin clicks "Send Email"
4. Customer receives email with:
   - Custom message (if provided)
   - Current order details
   - Link to view order

---

## 🎨 Email Templates

### 1. Order Created
- **When**: New order is placed
- **Subject**: `Order Confirmation - #[PO Number]`
- **Includes**: Order ID, Company, Date, Status (Open), Total, "View Order" button

### 2. In Process
- **When**: Status changes to "In Process"
- **Subject**: `Order Update: Now Processing - #[PO Number]`
- **Includes**: Order ID, Sales Order # (if available), Status, Total, "View Order" button

### 3. Ready for Pickup
- **When**: Status changes to "Ready"
- **Subject**: `Order Ready for Pickup - #[PO Number]`
- **Includes**: Order ID, Status, Total, **Pickup Address**, "View Order" button

### 4. Cancelled
- **When**: Status changes to "Cancelled"
- **Subject**: `Order Cancelled - #[PO Number]`
- **Includes**: Order ID, Company, Status, "View Order" button

### 5. Custom Update (Manual)
- **When**: Admin clicks "Send Update"
- **Subject**: `Order Update - #[PO Number]`
- **Includes**: Custom message, Order ID, Status, "View Order" button

---

## 🛡️ Security Features

✅ **OAuth Authentication** - No passwords stored anywhere
✅ **Sender Locked** - Only `orders@qiqiglobal.com` can send
✅ **Server-Side Only** - All email logic runs on server (credentials never exposed to browser)
✅ **Rate Limiting** - Maximum 10 emails per minute per user
✅ **No Secret Logging** - Tokens and secrets never appear in logs
✅ **Token Caching** - Access tokens cached and auto-refreshed (reduces API calls)

---

## 🐛 Troubleshooting

### Error: "535 5.7.3 Authentication unsuccessful"

**Causes**:
1. SMTP.SendAsApp permission not granted
2. Admin consent not provided
3. Authenticated SMTP disabled

**Fix**:
- Follow Step 2 & 3 above to configure permissions
- Ensure admin consent is granted (green checkmark in Azure)
- Enable authenticated SMTP in Exchange Admin Center

### Error: "550 5.7.60 Client not authorized to send as this sender"

**Causes**:
- Trying to send from an email other than `orders@qiqiglobal.com`

**Fix**:
- The system is locked to only send from `orders@qiqiglobal.com`
- Verify the mailbox exists and is properly configured

### Emails Not Sending

**Check**:
1. Environment variables are set correctly in `.env.local`
2. Run test script: `npx ts-node scripts/test-mail.ts your-email@example.com`
3. Check browser console for errors
4. Check server logs for detailed error messages

---

## 📊 Where Emails Are Sent

### Automatic Triggers
- **File**: `app/components/shared/OrderFormView.tsx` (line ~937)
  - Sends email after order creation
- **File**: `app/components/shared/OrderDetailsView.tsx` (line ~534)
  - Sends email after status changes

### Manual Trigger
- **File**: `app/components/shared/OrderDetailsView.tsx` (line ~749)
  - Handles "Send Update" button click
  - Shows modal and sends custom email

---

## 🎯 Next Steps

1. **Add environment variables** to `.env.local` (see Step 1)
2. **Configure Azure permissions** (see Step 2)
3. **Test the system** using the test script
4. **Place a test order** to see automatic emails in action
5. **Change order status** to see automatic notifications

---

## 📞 Support

If you encounter any issues:

1. Run the test script to verify SMTP configuration
2. Check the troubleshooting section above
3. Review server logs for detailed error messages
4. Verify all Azure permissions are granted

All emails will be sent from: **orders@qiqiglobal.com** ✉️

**System is ready to go! Just add the environment variables and test!** 🚀

