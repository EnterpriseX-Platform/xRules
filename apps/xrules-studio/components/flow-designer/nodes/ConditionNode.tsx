'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';
import { NodeData } from '@/types';

const ConditionNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  return (
    <div
      className={`relative min-w-[180px] rounded-lg border-2 bg-card p-4 shadow-sm transition-all ${
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-amber-500/50'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-amber-500"
      />

      {/* True Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!h-3 !w-3 !border-2 !bg-green-500"
        style={{ top: '35%' }}
      />

      {/* False Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        id="false"
        className="!h-3 !w-3 !border-2 !bg-red-500"
        style={{ top: '65%' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-amber-500/10">
          <GitBranch className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.label || 'Condition'}</p>
          <p className="text-xs text-muted-foreground">If/Else</p>
        </div>
      </div>

      {/* Labels for outputs */}
      <div className="absolute right-0 top-[35%] -translate-y-1/2 translate-x-full px-1">
        <span className="text-[10px] text-green-600 font-medium">True</span>
      </div>
      <div className="absolute right-0 top-[65%] -translate-y-1/2 translate-x-full px-1">
        <span className="text-[10px] text-red-600 font-medium">False</span>
      </div>

      {/* Config Preview */}
      {data.config?.condition && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground truncate block">
            {data.config.condition}
          </span>
        </div>
      )}
    </div>
  );
});

ConditionNode.displayName = 'ConditionNode';

export default ConditionNode;
