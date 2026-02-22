'use client'

import { useCallback, useState } from 'react'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Play, Save, Settings, RotateCcw } from 'lucide-react'
import { FlowCanvas } from '@/components/flow-designer/FlowCanvas'
import { NodePalette } from '@/components/flow-designer/NodePalette'
import { NodeType } from '@/types'

interface RuleEditorPageProps {
  params: { id: string; projectId: string; ruleId: string }
}

export default function RuleEditorPage({ params }: RuleEditorPageProps) {
  const [isSaving, setIsSaving] = useState(false)

  const handleDragStart = useCallback((type: NodeType) => {
    // Handle drag start
    console.log('Drag start:', type)
  }, [])

  const handleSave = async () => {
    setIsSaving(true)
    // TODO: Save flow
    await new Promise(resolve => setTimeout(resolve, 1000))
    setIsSaving(false)
  }

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 flex flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4 flex justify-between items-center bg-card">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <span>Rules</span>
            <span>/</span>
            <span className="font-medium text-foreground">Rule Editor</span>
          </div>
          <h1 className="text-xl font-bold">Sample Rule</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button size="sm">
            <Play className="w-4 h-4 mr-2" />
            Test
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden">
        <NodePalette onDragStart={handleDragStart} />
        
        <div className="flex-1 flex flex-col">
          <Tabs defaultValue="designer" className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-4 w-auto justify-start">
              <TabsTrigger value="designer">Designer</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
              <TabsTrigger value="executions">Executions</TabsTrigger>
            </TabsList>
            
            <TabsContent value="designer" className="flex-1 m-0 p-4">
              <Card className="h-full">
                <FlowCanvas />
              </Card>
            </TabsContent>
            
            <TabsContent value="settings" className="flex-1 m-0 p-4">
              <Card className="h-full p-6">
                <h3 className="text-lg font-medium mb-4">Rule Settings</h3>
                <p className="text-muted-foreground">Settings form coming soon...</p>
              </Card>
            </TabsContent>
            
            <TabsContent value="executions" className="flex-1 m-0 p-4">
              <Card className="h-full p-6">
                <h3 className="text-lg font-medium mb-4">Execution History</h3>
                <p className="text-muted-foreground">Execution logs coming soon...</p>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
