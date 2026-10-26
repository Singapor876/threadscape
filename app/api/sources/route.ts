import { NextResponse } from 'next/server';

const backend = process.env.PYTHON_BACKEND_URL || 'http://127.0.0.1:8000';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') || '';
  try { const response = await fetch(`${backend}/sources?q=${encodeURIComponent(query)}`); return NextResponse.json(await response.json(), { status: response.status }); }
  catch { return NextResponse.json({ sources: [] }); }
}
