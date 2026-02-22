import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// GET /api/projects
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    
    const projects = await prisma.project.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      include: {
        _count: { select: { rules: true } },
        workspace: true
      }
    })
    return NextResponse.json(projects)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    )
  }
}

// POST /api/projects
export async function POST(request: Request) {
  try {
    const data = await request.json()
    const project = await prisma.project.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        workspaceId: data.workspaceId,
        ownerId: data.ownerId
      }
    })
    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    )
  }
}
