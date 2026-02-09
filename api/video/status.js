// Proxy: POST /api/video/status -> SiliconFlow POST /v1/video/status
// Set env SILICONFLOW_API_KEY in Vercel / your host.

const SILICONFLOW_STATUS = 'https://api.siliconflow.cn/v1/video/status';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.SILICONFLOW_API_KEY;
  if (!token) {
    return res.status(500).json({ error: 'SILICONFLOW_API_KEY not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { requestId } = body;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId required' });
    }

    const response = await fetch(SILICONFLOW_STATUS, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId }),
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
