import { NextRequest, NextResponse } from 'next/server'

const ENGINE_BASE_URL = process.env.ENGINE_URL || 'http://localhost:50051'

async function proxyToEngine(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${ENGINE_BASE_URL}/${path}${searchParams ? `?${searchParams}` : ''}`

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...Object.fromEntries(request.headers),
      },
      body: request.method !== 'GET' && request.method !== 'HEAD' 
        ? await request.text() 
        : undefined,
    })

    const data = await response.text()
    
    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Engine unreachable', details: String(error) },
      { status: 503 }
    )
  }
}

export const GET = proxyToEngine
export const POST = proxyToEngine
export const PUT = proxyToEngine
export const DELETE = proxyToEngine
export const PATCH = proxyToEngine
