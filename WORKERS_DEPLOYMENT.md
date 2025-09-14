# Cloudflare Workers Deployment Guide

This guide explains how to deploy LibreTV to Cloudflare Workers.

## Prerequisites

1. [Cloudflare account](https://dash.cloudflare.com/)
2. [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed:
   ```bash
   npm install -g wrangler
   ```
3. Authenticate with Cloudflare:
   ```bash
   wrangler login
   ```

## Deployment Steps

### 1. Configure Environment Variables

Set the required environment variables in the Cloudflare dashboard or using Wrangler:

```bash
# Required - Set your password
wrangler secret put PASSWORD

# Optional configuration
wrangler secret put DEBUG
wrangler secret put CORS_ORIGIN
wrangler secret put REQUEST_TIMEOUT
wrangler secret put MAX_RETRIES
wrangler secret put USER_AGENT
wrangler secret put BLOCKED_HOSTS
wrangler secret put BLOCKED_IP_PREFIXES
wrangler secret put FILTERED_HEADERS
```

**Important**: The PASSWORD environment variable is required for security. Without it, the application will not function properly.

### 2. Deploy to Workers

Deploy using Wrangler:

```bash
# Development deployment
wrangler deploy --env development

# Production deployment
wrangler deploy --env production
```

The deployment will automatically:
- Upload static files (HTML, CSS, JS, images) to Workers Sites
- Create KV namespaces for static content
- Deploy the worker.js script

### 3. Custom Domain (Optional)

To use a custom domain:

1. In the Cloudflare dashboard, go to Workers → Your worker
2. Click "Add Custom Domain"
3. Enter your domain and follow the setup instructions

## Configuration Options

### Environment Variables

- `PASSWORD` (Required): User authentication password
- `DEBUG`: Enable debug logging (default: false)
- `CORS_ORIGIN`: CORS origin setting (default: *)
- `REQUEST_TIMEOUT`: Request timeout in ms (default: 30000)
- `MAX_RETRIES`: Maximum retry attempts (default: 2)
- `USER_AGENT`: User agent for proxy requests
- `BLOCKED_HOSTS`: Comma-separated list of blocked hostnames
- `BLOCKED_IP_PREFIXES`: Comma-separated list of blocked IP prefixes
- `FILTERED_HEADERS`: Comma-separated list of headers to filter in proxy responses

### Workers Sites Configuration

The `wrangler.toml` file is configured to automatically upload these file types:
- HTML files (*.html)
- JavaScript files (js/**/*.js, *.js)
- CSS files (css/**/*.css, *.css)
- Images (image/**/.*)
- Configuration files (*.json, manifest.json)
- Other static assets

## Testing

After deployment, test the following:

1. Access the main page: `https://your-worker.your-subdomain.workers.dev/`
2. Test search functionality: `https://your-worker.your-subdomain.workers.dev/s=test`
3. Verify proxy functionality (requires authentication)

## Troubleshooting

### Common Issues

1. **Static files not loading**: Ensure Workers Sites is properly configured in `wrangler.toml`
2. **Authentication errors**: Verify the PASSWORD environment variable is set
3. **Proxy timeouts**: Workers have a 30-second CPU time limit
4. **CORS issues**: Check CORS_ORIGIN environment variable

### Logs and Monitoring

View real-time logs:
```bash
wrangler tail
```

Monitor in Cloudflare dashboard:
- Workers → Your worker → Metrics
- Workers → Your worker → Real-time Logs

## Updating

To update your deployment:

1. Make changes to your code
2. Run deployment command again:
   ```bash
   wrangler deploy --env production
   ```

Workers deployments are atomic and near-instantaneous.

## Limits and Considerations

- **CPU Time**: 30 seconds per request (Workers Paid plan)
- **Memory**: 128MB per request
- **Request Size**: 100MB maximum
- **Response Size**: 100MB maximum
- **KV Storage**: Used for static files, has eventual consistency

For more information, see [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/).