import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

// GET /api/executions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const ruleId = searchParams.get('ruleId')
    
    const executions = await prisma.execution.findMany({
      where: ruleId ? { ruleId } : undefined,
      include: {
        rule: {
          select: { name: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(executions)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch executions' },
      { status: 500 }
    )
  }
}

// POST /api/executions
export async function POST(request: Request) {
  try {
    const data = await request.json()
    const execution = await prisma.execution.create({
      data: {
        input: data.input,
        status: 'PENDING',
        ruleId: data.ruleId
      }
    })
    return NextResponse.json(execution, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create execution' },
      { status: 500 }
    )
  }
}
