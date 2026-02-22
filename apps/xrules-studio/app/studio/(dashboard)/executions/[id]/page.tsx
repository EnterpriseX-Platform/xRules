import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDistanceToNow } from 'date-fns'

interface ExecutionPageProps {
  params: { id: string }
}

export default async function ExecutionPage({ params }: ExecutionPageProps) {
  const execution = await prisma.execution.findUnique({
    where: { id: params.id },
    include: {
      rule: {
        include: {
          project: true
        }
      }
    }
  })

  if (!execution) {
    notFound()
  }

  const statusColors = {
    PENDING: 'bg-yellow-500',
    RUNNING: 'bg-blue-500',
    SUCCESS: 'bg-green-500',
    FAILED: 'bg-red-500',
    TIMEOUT: 'bg-orange-500',
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <span>Executions</span>
            <span>/</span>
            <span className="font-mono">{execution.id.slice(0, 8)}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Execution Details</h1>
            <Badge className={statusColors[execution.status]}>
              {execution.status}
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {execution.rule.name} • {execution.rule.project.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Input</CardTitle>
            <CardDescription>Execution input data</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
              {JSON.stringify(execution.input, null, 2)}
            </pre>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Execution output data</CardDescription>
          </CardHeader>
          <CardContent>
            {execution.output ? (
              <pre className="bg-muted p-4 rounded-lg overflow-auto text-sm">
                {JSON.stringify(execution.output, null, 2)}
              </pre>
            ) : (
              <p className="text-muted-foreground">No output</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium">{execution.status}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium">
              {execution.duration ? `${execution.duration}ms` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="font-medium">
              {formatDistanceToNow(execution.createdAt, { addSuffix: true })}
            </span>
          </div>
          {execution.error && (
            <div className="mt-4 p-4 bg-red-50 text-red-900 rounded-lg">
              <h4 className="font-medium mb-2">Error</h4>
              <p className="text-sm">{execution.error}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
