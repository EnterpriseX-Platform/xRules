'use client';

import { memo } from 'react';
import { EdgeProps, getSmoothStepPath } from '@xyflow/react';

const ConnectionLine = memo(({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
}: EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <path
      id={id}
      style={{
        ...style,
        strokeWidth: 2,
        stroke: '#64748b',
      }}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
      fill="none"
    />
  );
});

ConnectionLine.displayName = 'ConnectionLine';

export default ConnectionLine;
