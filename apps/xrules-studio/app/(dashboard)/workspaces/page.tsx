import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Building2, FolderKanban } from 'lucide-react'

export default async function WorkspacesPage() {
  const workspaces = await prisma.workspace.findMany({
    include: {
      _count: {
        select: { projects: true, members: true }
      }
    }
  })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Workspaces</h1>
          <p className="text-muted-foreground mt-1">
            Manage your workspaces and projects
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          New Workspace
        </Button>
      </div>

      {workspaces.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first workspace to get started
            </p>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Workspace
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{workspace.name}</CardTitle>
                      <CardDescription className="text-sm">
                        {workspace.plan} Plan
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FolderKanban className="w-4 h-4" />
                      {workspace._count.projects} Projects
                    </div>
                    <div className="flex items-center gap-1">
                      <Building2 className="w-4 h-4" />
                      {workspace._count.members} Members
                    </div>
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
