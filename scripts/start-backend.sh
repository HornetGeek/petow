#!/bin/bash

echo "🚀 Starting PetMatch Backend with Docker..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install it first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating necessary directories..."
mkdir -p patmatch/media
mkdir -p patmatch/staticfiles

# Set environment variables
export SECRET_KEY=$(openssl rand -hex 32)
export POSTGRES_USER=petmatch_user
export POSTGRES_PASSWORD=petmatch_password_$(openssl rand -hex 8)

echo "🔑 Generated secret keys..."

# Build and start backend services
echo "🏗️ Building and starting backend services..."
docker-compose -f docker-compose.backend.yml up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "📊 Checking service status..."
docker-compose -f docker-compose.backend.yml ps

# Show logs
echo "📋 Recent logs:"
docker-compose -f docker-compose.backend.yml logs --tail=20

echo ""
echo "✅ PetMatch Backend is starting up!"
echo "🔧 Backend API: http://localhost:8000/api"
echo "⚙️ Admin Panel: http://localhost:8000/admin"
echo "🗄️ Database: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo ""
echo "📝 To view logs: docker-compose -f docker-compose.backend.yml logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.backend.yml down"
echo "🔄 To restart: docker-compose -f docker-compose.backend.yml restart"
echo ""
echo "🌐 Frontend: Deploy to Vercel and update vercel.json with your EC2 IP" 