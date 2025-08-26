# Cloudflare Proxy Setup for Petow.app

## Overview
This setup uses Cloudflare as a reverse proxy to provide HTTPS for your backend API while keeping your backend server on HTTP port 8000.

## Architecture
```
Frontend (Vercel): https://petow.app ✅
API Subdomain: https://api.petow.app ✅ (Cloudflare proxy)
Backend Server: http://13.60.199.22:8000 ✅ (internal only)
```

## What We've Configured

### 1. Updated Nginx Configuration
- **Main domain**: `petow.app` → serves frontend (handled by Vercel)
- **API subdomain**: `api.petow.app` → serves backend API
- **Port 80**: Nginx listens on standard HTTP port
- **Backend forwarding**: All API requests forwarded to `backend:8000`

### 2. Updated Docker Compose
- Removed frontend service (now hosted on Vercel)
- Updated backend environment variables for new domains
- Added CORS origins for HTTPS domains

### 3. Updated Frontend API Configuration
- Changed `API_BASE_URL` to use `https://api.petow.app/api`

## Next Steps to Complete Setup

### Step 1: Add DNS Record in Cloudflare
1. Go to Cloudflare Dashboard → DNS section
2. Add new A record:
   ```
   Type: A
   Name: api
   IPv4 address: 13.60.199.22
   Proxy status: Proxied (orange cloud icon) ✅
   TTL: Auto
   ```

### Step 2: Configure Cloudflare SSL/TLS
1. Go to SSL/TLS section
2. Set encryption mode to **"Full"**
3. Enable **"Always Use HTTPS"**

### Step 3: Restart Backend Services
```bash
./scripts/restart-backend.sh
```

### Step 4: Update Vercel Environment Variables
In your Vercel dashboard:
```bash
NEXT_PUBLIC_API_URL=https://api.petow.app/api
```

## How It Works

1. **Frontend makes HTTPS request** to `https://api.petow.app/api`
2. **Cloudflare receives HTTPS request** on port 443
3. **Cloudflare forwards to your server** on port 80 (HTTP)
4. **Nginx receives request** on port 80
5. **Nginx forwards to backend** on port 8000 (HTTP)
6. **Backend responds** (HTTP)
7. **Nginx forwards response** back to Cloudflare
8. **Cloudflare sends HTTPS response** to frontend

## Benefits

✅ **No mixed content errors**  
✅ **Automatic HTTPS** via Cloudflare  
✅ **No server SSL configuration needed**  
✅ **DDoS protection** included  
✅ **Global CDN** performance  
✅ **Standard port 80** for Nginx  

## Testing

After setup, test your API:
```bash
curl https://api.petow.app/health/
```

## Troubleshooting

### If you get mixed content errors:
1. Check that `api.petow.app` DNS record is **proxied** (orange cloud)
2. Verify SSL/TLS mode is set to **"Full"**
3. Ensure Vercel environment variable is set correctly

### If API calls fail:
1. Check that backend services are running: `docker-compose ps`
2. Verify Nginx is running and listening on port 80
3. Check Nginx logs: `docker logs petmatch_nginx`

## Files Modified

- `nginx/nginx.conf` - Added domain and subdomain server blocks
- `docker-compose.yml` - Updated environment variables, removed frontend
- `petow-frontend/src/lib/api.ts` - Updated API base URL
- `scripts/restart-backend.sh` - New restart script

## Security Notes

- Backend runs on internal port 8000 (not exposed externally)
- Nginx runs on port 80 (standard HTTP)
- All external traffic goes through Cloudflare HTTPS
- CORS is configured for your domains 