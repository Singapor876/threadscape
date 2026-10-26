import { NextResponse } from 'next/server';

const backend = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  try {
    const response = await fetch(`${backend}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await request.text(), signal: request.signal });
    if (!response.ok) return NextResponse.json(await response.json().catch(() => ({ detail: 'Python 后端请求失败' })), { status: response.status });
    return new Response(response.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
  } catch { return NextResponse.json({ error: '无法连接 Python/LangGraph 后端，请先运行后端服务' }, { status: 503 }); }
}
