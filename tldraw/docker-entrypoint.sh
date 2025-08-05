#!/bin/sh

# Check if we're in development mode based on environment variable or file existence
if [ "$BUILD_MODE" = "development" ] || [ ! -d "dist" ]; then
    echo "Starting TLDraw in development mode..."
    exec npm run dev
else
    echo "Starting TLDraw in production mode..."
    exec serve -s dist -l 3000
fi