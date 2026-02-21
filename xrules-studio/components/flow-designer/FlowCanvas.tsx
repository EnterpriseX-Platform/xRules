'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Play, Save, Undo, Redo, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useFlowStore } from '@/stores/flow-store';
import { NodeType } from '@/types';

// Node Types
import ApiInputNode from './nodes/ApiInputNode';
import ApiOutputNode from './nodes/ApiOutputNode';
import DatabaseNode from './nodes/DatabaseNode';
import HttpNode from './nodes/HttpNode';
import ConditionNode from './nodes/ConditionNode';
import TransformNode from './nodes/TransformNode';
import SftpNode from './nodes/SftpNode';
import ScheduleTriggerNode from './nodes/ScheduleTriggerNode';
import BasketTriggerNode from './nodes/BasketTriggerNode';

const nodeTypes = {
  'api-input': ApiInputNode,
  'api-output': ApiOutputNode,
  database: DatabaseNode,
  http: HttpNode,
  condition: ConditionNode,
  transform: TransformNode,
  sftp: SftpNode,
  'schedule-trigger': ScheduleTriggerNode,
  'basket-trigger': BasketTriggerNode,
};

interface FlowCanvasInnerProps {
  ruleId?: string;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
  onExecute?: () => void;
}

function FlowCanvasInner({ ruleId, onSave, onExecute }: FlowCanvasInnerProps) {
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes: setStoreNodes,
    setEdges: setStoreEdges,
    selectedNode,
    setSelectedNode,
    setIsDirty,
  } = useFlowStore();

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(storeEdges);
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Sync with store
  useEffect(() => {
    setNodes(storeNodes);
  }, [storeNodes, setNodes]);

  useEffect(() => {
    setEdges(storeEdges);
  }, [storeEdges, setEdges]);

  // Update store when nodes/edges change
  useEffect(() => {
    setStoreNodes(nodes);
  }, [nodes, setStoreNodes]);

  useEffect(() => {
    setStoreEdges(edges);
  }, [edges, setStoreEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, type: 'smoothstep' }, eds));
      setIsDirty(true);
    },
    [setEdges, setIsDirty]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node as any);
    },
    [setSelectedNode]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, [setSelectedNode]);

  const handleSave = useCallback(() => {
    onSave?.(nodes, edges);
  }, [nodes, edges, onSave]);

  const handleExecute = useCallback(() => {
    onExecute?.();
  }, [onExecute]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b bg-card p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => zoomOut()}
            title="Zoom Out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fitView()}
            title="Fit View"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => zoomIn()}
            title="Zoom In"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="h-6 w-px bg-border mx-2" />
          <Button variant="outline" size="sm" disabled>
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled>
            <Redo className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExecute}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Execute
          </Button>
        </div>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={setReactFlowInstance}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
          className="bg-background"
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls className="bg-card border" />
          <MiniMap
            className="bg-card border"
            nodeColor={(node) => {
              switch (node.type) {
                case 'api-input':
                  return '#3b82f6';
                case 'api-output':
                  return '#22c55e';
                case 'database':
                  return '#a855f7';
                case 'http':
                  return '#06b6d4';
                case 'condition':
                  return '#f59e0b';
                case 'transform':
                  return '#ec4899';
                case 'sftp':
                  return '#f97316';
                case 'schedule-trigger':
                  return '#14b8a6';
                case 'basket-trigger':
                  return '#6366f1';
                default:
                  return '#6b7280';
              }
            }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}

interface FlowCanvasProps extends FlowCanvasInnerProps {}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
