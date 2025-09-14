# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreTV is a free online video search and streaming platform that aggregates content from multiple video sources. It's a Node.js-based web application that provides both frontend interfaces and backend proxy services.

**Important Security Note**: This project requires a PASSWORD environment variable for all deployments to prevent unauthorized public access.

## Development Commands

### Node.js Development
```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Start production server
npm start
```

### Cloudflare Workers Development
```bash
# Install Wrangler CLI globally
npm install -g wrangler

# Authenticate with Cloudflare
wrangler login

# Set environment variables
wrangler secret put PASSWORD

# Local development
wrangler dev

# Deploy to production
wrangler deploy --env production
```

The development server runs on port 8080 by default (configurable via PORT environment variable).

## Architecture

### Core Components

- **server.mjs**: Express server providing static file serving, HTML template rendering, and proxy services
- **middleware.js**: Vercel-specific middleware for environment variable injection
- **js/**: Frontend JavaScript modules organized by functionality
- **HTML files**: Static pages (index.html, player.html, watch.html, about.html)

### Key JavaScript Modules

- `js/app.js`: Main application entry point
- `js/api.js`: API communication layer
- `js/player.js`: Video player integration (HLS.js + DPlayer)
- `js/search.js`: Video search functionality
- `js/config.js`: Configuration management
- `js/password.js`: Authentication system
- `js/proxy-auth.js`: Proxy request authentication

### Authentication System

The application uses SHA-256 hashed passwords for:
1. User access control (frontend authentication)
2. Proxy request authorization (backend security)

Password is injected into HTML templates via `{{PASSWORD}}` placeholder replacement.

### Proxy Architecture

The `/proxy/:encodedUrl` endpoint provides authenticated video stream proxying with:
- Request validation and sanitization
- Retry logic and timeout handling
- Security headers filtering
- IP/hostname blocking for internal network protection

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required - Must be set for security
PASSWORD=your_secure_password

# Server configuration
PORT=8080
DEBUG=false

# Request settings
REQUEST_TIMEOUT=5000
MAX_RETRIES=2
USER_AGENT=Mozilla/5.0...

# Security settings
BLOCKED_HOSTS=localhost,127.0.0.1,0.0.0.0,::1
BLOCKED_IP_PREFIXES=192.168.,10.,172.
```

## Deployment Platforms

The project is configured for multiple deployment platforms:

- **Vercel**: Uses `vercel.json` for routing and `middleware.js` for environment injection
- **Cloudflare Workers**: Uses `worker.js` entry point, `wrangler.toml` config, and Workers Sites for static files
- **Cloudflare Pages**: Static site deployment with serverless functions
- **Docker**: Includes `Dockerfile` and `docker-compose.yml`
- **Netlify**: Uses `netlify.toml` configuration
- **Render**: Uses `render.yaml` configuration

### Cloudflare Workers Deployment

For Workers deployment, use the dedicated files:

- **worker.js**: Workers-specific entry point (replaces server.mjs)
- **wrangler.toml**: Workers configuration and deployment settings
- **WORKERS_DEPLOYMENT.md**: Complete deployment guide

Key differences in Workers environment:
- Uses Web Crypto API instead of Node.js crypto module
- Static files served via Workers Sites and KV storage
- 30-second CPU time limit per request
- Uses fetch API instead of axios for HTTP requests
- Environment variables set via `wrangler secret put` command

Deploy with: `wrangler deploy --env production`

## Video Source Integration

The application supports Apple CMS V10 API format for video sources:
- Search endpoint: `api.php/provide/vod/?ac=videolist&wd=keyword`
- Detail endpoint: `api.php/provide/vod/?ac=detail&ids=videoID`

## Development Notes

- Uses ES6 modules (`"type": "module"` in package.json)
- Frontend uses vanilla JavaScript with modular architecture
- No build process required - serves static files directly
- Password security is handled via SHA-256 hashing
- All proxy requests require authentication to prevent abuse

## Security Considerations

- Never commit the actual PASSWORD to version control
- The middleware.js requires `js/sha256.js` for password hashing
- Proxy requests validate URLs to prevent SSRF attacks
- Internal network access is blocked by default