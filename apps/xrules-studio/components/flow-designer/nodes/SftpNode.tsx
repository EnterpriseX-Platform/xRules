'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { FolderSync } from 'lucide-react';
import { NodeData } from '@/types';

const SftpNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  return (
    <div
      className={`relative min-w-[180px] rounded-lg border-2 bg-card p-4 shadow-sm transition-all ${
        selected
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-orange-500/50'
      }`}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !bg-orange-500"
      />

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !bg-orange-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500/10">
          <FolderSync className="h-4 w-4 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{data.label || 'SFTP'}</p>
          <p className="text-xs text-muted-foreground">File Transfer</p>
        </div>
      </div>

      {/* Config Preview */}
      {data.config?.operation && (
        <div className="mt-2 pt-2 border-t border-border">
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-orange-500/10 text-orange-600">
            {data.config.operation}
          </span>
        </div>
      )}
    </div>
  );
});

SftpNode.displayName = 'SftpNode';

export default SftpNode;
