# Vercel Deployment Fix

## Issue
The error `routes-manifest.json couldn't be found` occurs because Vercel is trying to build from the wrong directory.

## Solution

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project settings
2. Navigate to **Settings** → **General**
3. Scroll to **Root Directory**
4. Click **Edit** and set it to: `petow-frontend`
5. Click **Save**
6. Redeploy your project

### Option 2: Via Vercel CLI

If deploying via CLI, use:

```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite
vercel --cwd petow-frontend
```

Or navigate to the folder first:

```bash
cd /media/hornet/84ACF2FAACF2E5981/petWebsite/petow-frontend
vercel
```

## Files Updated

The following files have been fixed:

1. ✅ `package.json` - Removed `--turbopack` flag from build script (not supported in Vercel production)
2. ✅ `vercel.json` - Created with proper configuration
3. ✅ `next.config.js` - Updated with complete configuration
4. ✅ `tsconfig.json` - Created for TypeScript support
5. ✅ `tailwind.config.js` - Created for Tailwind CSS
6. ✅ `postcss.config.mjs` - Created for PostCSS
7. ✅ `.vercelignore` - Created to ignore unnecessary folders

## Environment Variables

Make sure these are set in Vercel:

- `NEXT_PUBLIC_API_URL` = `https://api.petow.app/api`
- Add any other API keys or secrets your app needs (Firebase, NextAuth, etc.)

## Next Steps

After setting the root directory to `petow-frontend`:

1. Push your changes to Git
2. Vercel will automatically redeploy
3. Or trigger a manual redeploy from the dashboard

Your deployment should now work correctly!

