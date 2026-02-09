import { NextResponse } from 'next/server';

const SILICONFLOW_STATUS = 'https://api.siliconflow.cn/v1/video/status';

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
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'requestId required' },
        { status: 400 }
      );
    }

    const response = await fetch(SILICONFLOW_STATUS, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId }),
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
