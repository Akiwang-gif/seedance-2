import { NextResponse } from 'next/server';

const SILICONFLOW_SUBMIT = 'https://api.siliconflow.cn/v1/video/submit';

export async function POST(request) {
  const token = process.env.SILICONFLOW_API_KEY;
  if (!token) {
    return NextResponse.json(
      { error: 'SILICONFLOW_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
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
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || 'Proxy error' },
      { status: 500 }
    );
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
