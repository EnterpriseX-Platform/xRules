'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Database } from 'lucide-react';
import { NodeData } from '@/types';

const DatabaseNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  return (
    <div
      className={`relative min-w-[180px] rounded-lg border-2 bg-card p-4 shadow-sm transition-all ${
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-purple-500/50'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-purple-500"
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-purple-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-purple-500/10">
          <Database className="h-4 w-4 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.label || 'Database'}</p>
          <p className="text-xs text-muted-foreground">SQL Operation</p>
        </div>
      </div>

      {/* Config Preview */}
      {data.config?.operation && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-600">
            {data.config.operation}
          </span>
        </div>
      )}
    </div>
  );
});

DatabaseNode.displayName = 'DatabaseNode';

export default DatabaseNode;
