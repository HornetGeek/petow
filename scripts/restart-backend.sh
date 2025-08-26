#!/bin/bash

echo "🔄 Restarting backend services with new configuration..."

# Stop existing services
echo "⏹️  Stopping existing services..."
docker-compose down

# Remove old containers and networks
echo "🧹 Cleaning up old containers and networks..."
docker system prune -f

# Start services with new configuration
echo "🚀 Starting services with new configuration..."
docker-compose up -d

# Show status
echo "📊 Service status:"
docker-compose ps

echo "✅ Backend services restarted successfully!"
echo "🌐 Your API is now available at: https://api.petow.app"
echo "🏠 Your frontend is at: https://petow.app"
echo "🔌 Nginx is running on port 80 (standard HTTP port with proper privileges)"
echo ""
echo "📝 Don't forget to:"
echo "   1. Add DNS record: api.petow.app → 13.60.199.22 (proxied)"
echo "   2. Set SSL/TLS mode to 'Full' in Cloudflare"
echo "   3. Update your Vercel environment variable: NEXT_PUBLIC_API_URL=https://api.petow.app/api"
echo "   4. Note: Nginx now runs on port 80 with NET_BIND_SERVICE capability" 