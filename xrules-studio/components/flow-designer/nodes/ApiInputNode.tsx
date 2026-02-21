'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Globe } from 'lucide-react';
import { NodeData } from '@/types';

const ApiInputNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  return (
    <div
      className={`relative min-w-[180px] rounded-lg border-2 bg-card p-4 shadow-sm transition-all ${
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-blue-500/50'
      }`}
    >
      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-blue-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/10">
          <Globe className="h-4 w-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.label || 'API Input'}</p>
          <p className="text-xs text-muted-foreground">HTTP Request</p>
        </div>
      </div>

      {/* Config Preview */}
      {data.config?.method && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/10 text-blue-600">
            {data.config.method}
          </span>
          {data.config.path && (
            <span className="text-xs text-muted-foreground ml-2 truncate">
              {data.config.path}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

ApiInputNode.displayName = 'ApiInputNode';

export default ApiInputNode;
