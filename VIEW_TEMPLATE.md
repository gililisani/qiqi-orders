# How to View the Tailwind Template

The Tailwind Template is a **Material Tailwind Dashboard NextJS PRO** template - a complete Next.js application with example pages.

## Quick Start (Terminal Commands)

### Option 1: Run in a new terminal window (Recommended)
1. Open a new terminal window/tab
2. Navigate to the template directory:
   ```bash
   cd "Tailwind Template"
   ```
3. Install dependencies (first time only):
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser and go to:
   ```
   http://localhost:3000
   ```

### Option 2: Run from your main project directory
```bash
cd "Tailwind Template" && npm install && npm run dev
```

## What You'll See

The template includes demo pages such as:
- **Dashboard pages**: `/dashboard/sales`, `/dashboard/analytics`
- **E-commerce pages**: `/ecommerce/products/product-page`, `/ecommerce/order-list`
- **Auth pages**: `/auth/signin/basic`, `/auth/signup/basic-signup`
- **Example components**: Tables, forms, charts, widgets

## Available Routes

Once running, you can navigate to:
- `http://localhost:3000` - Main dashboard/homepage
- `http://localhost:3000/dashboard/sales` - Sales dashboard
- `http://localhost:3000/dashboard/analytics` - Analytics dashboard
- `http://localhost:3000/ecommerce/products/product-page` - Product page example
- `http://localhost:3000/ecommerce/order-list` - Order list example
- `http://localhost:3000/auth/signin/basic` - Sign in page

## Note

- The template runs on port **3000** by default
- If your main app is also running on port 3000, the template will automatically use port **3001**
- The template is for **viewing/reference only** - it's separate from your main application

## Stopping the Server

Press `Ctrl + C` in the terminal where the dev server is running.
