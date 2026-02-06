#!/bin/bash

# Deploy Script for Quest Quiz App on VPS

echo "🚀 Starting Quest Quiz deployment..."

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed. Installing PM2...${NC}"
    npm install -g pm2
fi

# Create logs directory
mkdir -p logs

# Stop existing PM2 processes
echo "⏹️  Stopping existing PM2 processes..."
pm2 stop all || true
pm2 delete all || true

# Build Next.js app
echo "🔨 Building Next.js app..."
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed! Exiting...${NC}"
    exit 1
fi

# Run Prisma migrations
echo "🗄️  Running Prisma migrations..."
npx prisma migrate deploy

# Start services with PM2
echo "▶️  Starting services with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "📊 PM2 Status:"
pm2 status
echo ""
echo "📝 View logs with:"
echo "  pm2 logs quest-socket-server"
echo "  pm2 logs quest-workers"
echo "  pm2 logs quest-nextjs"
echo ""
echo "🔄 Restart services with:"
echo "  pm2 restart all"
echo ""
echo "⏹️  Stop services with:"
echo "  pm2 stop all"
