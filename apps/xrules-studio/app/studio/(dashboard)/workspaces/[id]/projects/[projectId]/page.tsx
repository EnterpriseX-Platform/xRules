import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, FileCode2, Play, Settings } from 'lucide-react'

interface ProjectPageProps {
  params: { id: string; projectId: string }
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: {
      workspace: true,
      rules: {
        include: {
          _count: { select: { executions: true } }
        }
      }
    }
  })

  if (!project) {
    notFound()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Link href={`/studio/workspaces/${params.id}`} className="hover:underline">
              {project.workspace.name}
            </Link>
            <span>/</span>
            <span>Projects</span>
          </div>
          <h1 className="text-3xl font-bold">{project.name}</h1>
          <p className="text-muted-foreground mt-1">
            {project.description || 'No description'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Rule
          </Button>
        </div>
      </div>

      {project.rules.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FileCode2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No rules yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first rule to get started
            </p>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Rule
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {project.rules.map((rule) => (
            <Link 
              key={rule.id} 
              href={`/studio/workspaces/${params.id}/projects/${project.id}/rules/${rule.id}`}
            >
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileCode2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{rule.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {rule.type} • {rule.status}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                    {rule.description || 'No description'}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      v{rule.version}
                    </span>
                    <span className="text-muted-foreground">
                      {rule._count.executions} executions
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
