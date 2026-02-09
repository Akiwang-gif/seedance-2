// Proxy: POST /api/video/submit -> SiliconFlow POST /v1/video/submit
// Set env SILICONFLOW_API_KEY in Vercel / your host.

const SILICONFLOW_SUBMIT = 'https://api.siliconflow.cn/v1/video/submit';

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
    const { model, prompt, image_size, image, negative_prompt, seed } = body;

    const payload = {
      model: model || 'Wan-AI/Wan2.2-I2V-A14B',
      prompt: prompt || '',
      image_size: image_size || '1280x720',
    };
    if (image) payload.image = image;
    if (negative_prompt) payload.negative_prompt = negative_prompt;
    if (seed != null) payload.seed = seed;

    const response = await fetch(SILICONFLOW_SUBMIT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
