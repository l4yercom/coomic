#!/bin/bash
# Railway start script for Comic AI Editor (React app)

# Exit on any error
set -e

echo "🚀 Starting Comic AI Editor deployment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Serve the built files
echo "🌐 Starting server..."
npx serve -s dist -l $PORT

echo "✅ Comic AI Editor is running!"
