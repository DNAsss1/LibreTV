// Cloudflare Workers entry point for LibreTV
// Replaces server.mjs for Workers deployment

// Configuration from environment variables
const getConfig = (env) => ({
  password: env.PASSWORD || '',
  corsOrigin: env.CORS_ORIGIN || '*',
  timeout: parseInt(env.REQUEST_TIMEOUT || '30000'), // Workers have 30s limit
  maxRetries: parseInt(env.MAX_RETRIES || '2'),
  userAgent: env.USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  debug: env.DEBUG === 'true'
});

// Logging utility
const log = (debug, ...args) => {
  if (debug) {
    console.log('[DEBUG]', ...args);
  }
};

// SHA-256 hash using Web Crypto API
async function sha256Hash(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// CORS headers
const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block'
});

// URL validation
function isValidUrl(urlString, env) {
  try {
    const parsed = new URL(urlString);
    const allowedProtocols = ['http:', 'https:'];

    const blockedHostnames = (env.BLOCKED_HOSTS || 'localhost,127.0.0.1,0.0.0.0,::1').split(',');
    const blockedPrefixes = (env.BLOCKED_IP_PREFIXES || '192.168.,10.,172.').split(',');

    if (!allowedProtocols.includes(parsed.protocol)) return false;
    if (blockedHostnames.includes(parsed.hostname)) return false;

    for (const prefix of blockedPrefixes) {
      if (parsed.hostname.startsWith(prefix)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

// Template rendering function
async function renderPage(htmlContent, password) {
  if (password !== '') {
    const sha256 = await sha256Hash(password);
    return htmlContent.replace(/\{\{PASSWORD\}\}/g, sha256);
  } else {
    return htmlContent.replace(/\{\{PASSWORD\}\}/g, '');
  }
}

// Proxy authentication validation
async function validateProxyAuth(request, config) {
  const url = new URL(request.url);
  const authHash = url.searchParams.get('auth');
  const timestamp = url.searchParams.get('t');

  if (!config.password) {
    console.error('PASSWORD environment variable not set, proxy access denied');
    return false;
  }

  const serverPasswordHash = await sha256Hash(config.password);

  if (!authHash || authHash !== serverPasswordHash) {
    console.warn('Proxy auth failed: password hash mismatch');
    console.warn(`Expected: ${serverPasswordHash}, Received: ${authHash}`);
    return false;
  }

  // Validate timestamp (10 minutes validity)
  if (timestamp) {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    if (now - parseInt(timestamp) > maxAge) {
      console.warn('Proxy auth failed: timestamp expired');
      return false;
    }
  }

  return true;
}

// Handle proxy requests
async function handleProxy(request, env, config) {
  const url = new URL(request.url);
  const encodedUrl = url.pathname.split('/proxy/')[1];

  if (!encodedUrl) {
    return new Response('Missing URL parameter', { status: 400 });
  }

  // Validate authentication
  if (!(await validateProxyAuth(request, config))) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Proxy access unauthorized: check password configuration or auth parameters'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const targetUrl = decodeURIComponent(encodedUrl);

  // Security validation
  if (!isValidUrl(targetUrl, env)) {
    return new Response('Invalid URL', { status: 400 });
  }

  log(config.debug, `Proxy request: ${targetUrl}`);

  // Retry logic
  let retries = 0;
  const makeRequest = async () => {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': config.userAgent
        },
        // Workers automatically handle timeout based on plan limits
      });
      return response;
    } catch (error) {
      if (retries < config.maxRetries) {
        retries++;
        log(config.debug, `Retry request (${retries}/${config.maxRetries}): ${targetUrl}`);
        return makeRequest();
      }
      throw error;
    }
  };

  try {
    const response = await makeRequest();

    // Forward response with filtered headers
    const newHeaders = new Headers(response.headers);
    const sensitiveHeaders = (
      env.FILTERED_HEADERS ||
      'content-security-policy,cookie,set-cookie,x-frame-options,access-control-allow-origin'
    ).split(',');

    sensitiveHeaders.forEach(header => newHeaders.delete(header));

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    console.error('Proxy request error:', error.message);
    return new Response(`Request failed: ${error.message}`, { status: 500 });
  }
}

// Main fetch event handler
export default {
  async fetch(request, env, ctx) {
    const config = getConfig(env);
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(config.corsOrigin)
      });
    }

    // Handle proxy requests
    if (path.startsWith('/proxy/')) {
      const proxyResponse = await handleProxy(request, env, config);
      const headers = new Headers(proxyResponse.headers);
      Object.entries(corsHeaders(config.corsOrigin)).forEach(([key, value]) => {
        headers.set(key, value);
      });
      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: headers
      });
    }

    // Handle search URLs (e.g., /s=keyword)
    if (path.match(/^\/s=/)) {
      // This should serve index.html with password injection
      // We'll need to get the HTML content from Workers Sites or KV
      const htmlContent = await getStaticFile(env, 'index.html');
      const renderedHtml = await renderPage(htmlContent, config.password);
      return new Response(renderedHtml, {
        headers: {
          'Content-Type': 'text/html',
          ...corsHeaders(config.corsOrigin)
        }
      });
    }

    // Handle static HTML pages
    const htmlPages = ['/', '/index.html', '/player.html', '/watch.html', '/about.html'];
    if (htmlPages.includes(path) || path === '/') {
      let fileName = path === '/' ? 'index.html' : path.substring(1);
      const htmlContent = await getStaticFile(env, fileName);
      const renderedHtml = await renderPage(htmlContent, config.password);
      return new Response(renderedHtml, {
        headers: {
          'Content-Type': 'text/html',
          ...corsHeaders(config.corsOrigin)
        }
      });
    }

    // Handle other static files
    try {
      const staticContent = await getStaticFile(env, path.substring(1));
      const contentType = getContentType(path);
      return new Response(staticContent, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400', // 1 day cache
          ...corsHeaders(config.corsOrigin)
        }
      });
    } catch (error) {
      return new Response('Not Found', {
        status: 404,
        headers: corsHeaders(config.corsOrigin)
      });
    }
  }
};

// Helper function to get static files using Workers Sites
async function getStaticFile(env, fileName) {
  // Workers Sites implementation using __STATIC_CONTENT KV namespace
  if (env.__STATIC_CONTENT) {
    try {
      // Get the asset manifest
      const manifestJSON = await env.__STATIC_CONTENT.get('__STATIC_CONTENT_MANIFEST', 'json');
      if (!manifestJSON) {
        throw new Error('Static content manifest not found');
      }

      // Find the file in the manifest
      const assetKey = manifestJSON[fileName];
      if (!assetKey) {
        throw new Error(`File not found in manifest: ${fileName}`);
      }

      // Get the file content
      const content = await env.__STATIC_CONTENT.get(assetKey);
      if (!content) {
        throw new Error(`File content not found: ${fileName}`);
      }

      return content;
    } catch (error) {
      console.error(`Error loading static file ${fileName}:`, error.message);
      throw error;
    }
  }

  // Fallback for custom KV storage
  if (env.STATIC_FILES) {
    const content = await env.STATIC_FILES.get(fileName);
    if (content) {
      return content;
    }
  }

  throw new Error(`Static file not found: ${fileName}`);
}

// Content type detection
function getContentType(path) {
  const ext = path.split('.').pop()?.toLowerCase();
  const contentTypes = {
    'html': 'text/html; charset=utf-8',
    'js': 'application/javascript; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'txt': 'text/plain; charset=utf-8',
    'xml': 'application/xml; charset=utf-8'
  };

  return contentTypes[ext] || 'application/octet-stream';
}