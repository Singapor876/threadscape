import { NextResponse } from 'next/server';

const backend = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET() {
  try { const response = await fetch(`${backend}/state`, { cache: 'no-store' }); return NextResponse.json(await response.json(), { status: response.status }); }
  catch { return NextResponse.json({ error: '无法连接 Python 数据服务' }, { status: 503 }); }
}

export async function PUT(request: Request) {
  try {
    const response = await fetch(`${backend}/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: await request.text() });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ error: '无法连接 Python 数据服务' }, { status: 503 }); }
}
