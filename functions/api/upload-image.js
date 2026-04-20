/**
 * Cloudflare-native /api/upload-image
 */

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (same as current Vercel route)
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function getWriteSecret(env) {
  return String((env && env.CMS_WRITE_SECRET) || (env && env.CMS_SECRET) || '').trim();
}

function getBearer(request) {
  const auth = String(request.headers.get('authorization') || '');
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

function sanitizeFilename(name) {
  const raw = String(name || 'image').trim() || 'image';
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 9);
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env || !env.CMS_UPLOAD_R2) {
    return new Response(
      JSON.stringify({ error: 'CMS_UPLOAD_R2 binding is missing on Cloudflare.' }),
      { status: 503, headers: CORS },
    );
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed. Use POST with multipart/form-data and field "image".' }),
      { status: 405, headers: CORS },
    );
  }

  const secret = getWriteSecret(env);
  if (!secret) {
    return new Response(
      JSON.stringify({ error: 'Set CMS_WRITE_SECRET before enabling native upload mode.' }),
      { status: 503, headers: CORS },
    );
  }
  if (getBearer(request) !== secret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized. Provide Authorization: Bearer <CMS_WRITE_SECRET>.' }),
      { status: 401, headers: CORS },
    );
  }

  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return new Response(
      JSON.stringify({ error: 'Content-Type must be multipart/form-data' }),
      { status: 400, headers: CORS },
    );
  }

  try {
    const form = await request.formData();
    const file = form.get('image') || form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return new Response(JSON.stringify({ error: 'No image file' }), { status: 400, headers: CORS });
    }

    const size = Number(file.size) || 0;
    if (size <= 0) {
      return new Response(JSON.stringify({ error: 'Empty file' }), { status: 400, headers: CORS });
    }
    if (size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 4MB)' }), { status: 413, headers: CORS });
    }

    const name = sanitizeFilename(file.name);
    const key = `articles/${Date.now()}_${randomSuffix()}_${name}`;
    const body = await file.arrayBuffer();
    const contentTypeOut = String(file.type || 'application/octet-stream');

    await env.CMS_UPLOAD_R2.put(key, body, {
      httpMetadata: { contentType: contentTypeOut },
    });

    const base = String((env && env.CMS_UPLOAD_PUBLIC_BASE) || '').trim().replace(/\/$/, '');
    if (!base) {
      return new Response(
        JSON.stringify({ error: 'Missing CMS_UPLOAD_PUBLIC_BASE for native upload response URL.' }),
        { status: 500, headers: CORS },
      );
    }

    return new Response(JSON.stringify({ url: `${base}/${key}` }), { status: 200, headers: CORS });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e && e.message) || 'Upload failed' }),
      { status: 500, headers: CORS },
    );
  }
}
