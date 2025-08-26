#!/bin/bash

echo "🚀 Starting PetMatch with Docker..."

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
mkdir -p nginx/logs
mkdir -p ssl

# Set environment variables
export SECRET_KEY=$(openssl rand -hex 32)
export POSTGRES_USER=petmatch_user
export POSTGRES_PASSWORD=petmatch_password_$(openssl rand -hex 8)
export REDIS_PASSWORD=redis_password_$(openssl rand -hex 8)

echo "🔑 Generated secret keys..."

# Build and start services
echo "🏗️ Building and starting services..."
docker-compose up --build -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 30

# Check service status
echo "📊 Checking service status..."
docker-compose ps

# Show logs
echo "📋 Recent logs:"
docker-compose logs --tail=20

echo ""
echo "✅ PetMatch is starting up!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000/api"
echo "⚙️ Admin Panel: http://localhost:8000/admin"
echo "📊 Nginx: http://localhost:80"
echo ""
echo "📝 To view logs: docker-compose logs -f"
echo "🛑 To stop: docker-compose down"
echo "🔄 To restart: docker-compose restart" 