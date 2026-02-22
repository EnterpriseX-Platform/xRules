import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// GET /api/rules
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    
    const rules = await prisma.rule.findMany({
      where: projectId ? { projectId } : undefined,
      include: {
        _count: { select: { executions: true } },
        project: true
      }
    })
    return NextResponse.json(rules)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch rules' },
      { status: 500 }
    )
  }
}

// POST /api/rules
export async function POST(request: Request) {
  try {
    const data = await request.json()
    const rule = await prisma.rule.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        type: data.type || 'DECISION_TABLE',
        definition: data.definition || {},
        inputSchema: data.inputSchema,
        outputSchema: data.outputSchema,
        projectId: data.projectId,
        createdById: data.createdById
      }
    })
    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create rule' },
      { status: 500 }
    )
  }
}
