# Diagram Tools Hub

A Docker Compose setup that provides a unified interface for three popular diagramming and drawing tools:
- **Draw.io** - Professional diagramming tool
- **Excalidraw** - Virtual whiteboard for hand-drawn diagrams
- **tldraw** - Simple collaborative drawing tool

## 🚀 Quick Start

1. Clone this repository:
```bash
git clone <your-repo-url>
cd drawApp
```

2. Start all services:
```bash
docker-compose up -d
```

3. Access the tools:
   - **Unified Interface**: http://localhost:8080
   - **Draw.io Direct**: http://localhost:8080/drawio/
   - **Excalidraw Direct**: http://localhost:8080/excalidraw/
   - **tldraw Direct**: http://localhost:8080/tldraw/

## 📋 Prerequisites

- Docker Engine 20.10.0 or later
- Docker Compose 1.29.0 or later
- At least 2GB of available RAM
- Ports 8080-8083 available on your host

## 🏗️ Architecture

The setup consists of:
1. **Nginx Engine Server** (Port 8080) - Serves the unified interface and reverse proxies to tools
2. **Draw.io Container** (Internal port 8081)
3. **Excalidraw Container** (Internal port 8082)
4. **tldraw Container** (Internal port 8083)

## 📁 Project Structure

```
drawApp/
├── docker-compose.yml        # Docker Compose configuration
├── engine/
│   ├── nginx.conf           # Nginx reverse proxy configuration
│   └── html/
│       └── index.html       # Unified interface landing page
├── tldraw/
│   └── Dockerfile           # Custom build for tldraw
└── README.md               # This file
```

## 🛠️ Configuration

### Changing Ports

Edit `docker-compose.yml` to modify the exposed ports:

```yaml
services:
  engine:
    ports:
      - "8080:80"  # Change 8080 to your desired port
```

### Custom Domain

To use a custom domain, update the `server_name` in `engine/nginx.conf`:

```nginx
server_name your-domain.com;
```

## 🔧 Management Commands

### Start all services
```bash
docker-compose up -d
```

### Stop all services
```bash
docker-compose down
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f engine
docker-compose logs -f drawio
docker-compose logs -f excalidraw
docker-compose logs -f tldraw
```

### Restart a specific service
```bash
docker-compose restart drawio
```

### Update services
```bash
docker-compose pull
docker-compose up -d --build
```

## 🌐 Features

- **Unified Interface**: Beautiful landing page with quick access to all tools
- **Direct Access**: Each tool accessible via its own path
- **Service Status**: Real-time status monitoring of all tools
- **Responsive Design**: Works on desktop and mobile devices
- **WebSocket Support**: Full support for real-time collaboration features

## 🐛 Troubleshooting

### Services not starting

1. Check if ports are already in use:
```bash
lsof -i :8080-8083
```

2. View container logs:
```bash
docker-compose logs
```

### tldraw build fails

The tldraw container builds from source. If it fails:

1. Check internet connectivity
2. Ensure you have enough disk space
3. Try building with no cache:
```bash
docker-compose build --no-cache tldraw
```

### Nginx 502 Bad Gateway

This usually means a backend service isn't ready yet. Wait a few moments for all services to start, or check the specific service logs.

## 📝 Notes

- Draw.io and Excalidraw use official Docker images
- tldraw is built from source as there's no official Docker image
- All data is stored in browser local storage by default
- For persistent storage, you'll need to configure volumes for each tool

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📄 License

This Docker setup is provided as-is. The individual tools have their own licenses:
- Draw.io: Apache License 2.0
- Excalidraw: MIT License
- tldraw: Apache License 2.0 