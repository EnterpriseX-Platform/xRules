import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// GET /api/workspaces
export async function GET() {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        _count: {
          select: { projects: true, members: true }
        }
      }
    })
    return NextResponse.json(workspaces)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    )
  }
}

// POST /api/workspaces
export async function POST(request: Request) {
  try {
    const data = await request.json()
    const workspace = await prisma.workspace.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        plan: data.plan || 'FREE',
      }
    })
    return NextResponse.json(workspace, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create workspace' },
      { status: 500 }
    )
  }
}
