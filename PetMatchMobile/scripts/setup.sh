#!/bin/bash

# Setup script for PetMatch Mobile App

echo "Setting up PetMatch Mobile App..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Node.js version 18 or higher is required. Current version: $(node -v)"
    exit 1
fi

echo "Node.js version: $(node -v)"

# Install dependencies
echo "Installing dependencies..."
npm install

# Install iOS dependencies (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Installing iOS dependencies..."
    cd ios
    pod install
    cd ..
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p src/assets/{fonts,images}
mkdir -p android/app/src/main/assets

echo "Setup completed successfully!"
echo ""
echo "To run the app:"
echo "  Android: npm run android"
echo "  iOS: npm run ios"
echo "  Metro: npm start"

