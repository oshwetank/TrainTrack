/**
 * TrainTrack — Cloudflare Worker CORS Proxy
 * Forwards browser requests to RailRadar API, adds CORS headers.
 *
 * Environment variables (set via Cloudflare dashboard, never in code):
 *   RAILRADAR_API_KEY  — your RailRadar bearer token
 *
 * Security:
 *   - Only allows requests from oshwetank.github.io
 *   - Rate limited to 60 requests per IP per minute
 *   - No response caching (app handles its own SWR cache)
 *   - API key never exposed to client
 */

const ALLOWED_ORIGINS = [
  'https://oshwetank.github.io',
  'http://localhost:3000',   // local dev
  'http://127.0.0.1:5500',  // Live Server dev
];

const RAILRADAR_BASE = 'https://railradar.in/api';

const RATE_LIMIT_REQUESTS = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

// In-memory rate limit store (resets per Worker instance restart)
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_REQUESTS) return true;
  return false;
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function errorResponse(status, message, origin) {
  return new Response(
    JSON.stringify({ error: message, status }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(origin),
      },
    }
  );
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return new Response('Forbidden', { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only allow GET
    if (request.method !== 'GET') {
      return errorResponse(405, 'Method not allowed', origin);
    }

    // Validate origin
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return errorResponse(403, 'Origin not allowed', origin);
    }

    // Rate limiting by IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return errorResponse(429, 'Rate limit exceeded. Max 60 requests per minute.', origin);
    }

    // Build upstream URL: strip /proxy prefix, forward the rest to RailRadar
    // e.g. /proxy/station/MMCT/arrivals → railradar.in/api/station/MMCT/arrivals
    const upstreamPath = url.pathname.replace(/^\/proxy/, '');
    const upstreamUrl = `${RAILRADAR_BASE}${upstreamPath}${url.search}`;

    // Forward to RailRadar with API key
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.RAILRADAR_API_KEY}`,
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'User-Agent': 'TrainTrack-PWA/1.5.0',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      if (err.name === 'TimeoutError') {
        return errorResponse(504, 'RailRadar API timed out', origin);
      }
      return errorResponse(502, 'RailRadar API unreachable', origin);
    }

    // Pass through non-200 responses as structured errors
    if (!upstreamResponse.ok) {
      return errorResponse(
        upstreamResponse.status,
        `RailRadar returned ${upstreamResponse.status}`,
        origin
      );
    }

    const data = await upstreamResponse.text();

    return new Response(data, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...corsHeaders(origin),
      },
    });
  },
};
