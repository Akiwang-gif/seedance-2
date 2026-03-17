import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return neon(connectionString);
}

/** GET /api/users — 获取用户列表，或 ?email=xxx 查询单个 */
export async function GET(request) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (email) {
      const rows = await sql`SELECT id, email, name, created_at, updated_at FROM users WHERE email = ${email} LIMIT 1`;
      if (rows.length === 0) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    const rows = await sql`SELECT id, email, name, created_at, updated_at FROM users ORDER BY created_at DESC`;
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || 'Database error' },
      { status: 500 }
    );
  }
}

/** POST /api/users — 创建用户，body: { email, name? } */
export async function POST(request) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { email, name } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      );
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name != null ? String(name).trim() || null : null;

    const rows = await sql`
      INSERT INTO users (email, name, updated_at)
      VALUES (${trimmedEmail}, ${trimmedName}, NOW())
      ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, users.name),
        updated_at = NOW()
      RETURNING id, email, name, created_at, updated_at
    `;

    return NextResponse.json(rows[0], { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e.message || 'Database error' },
      { status: 500 }
    );
  }
}
