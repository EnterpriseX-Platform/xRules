/**
 * NodeComponent
 * React component wrapper for rendering nodes in the flow designer
 */

import React from 'react';
import { NodeConfig, NodeRenderProps, PropertyPanelProps } from '../types/node';

/**
 * Props for the base node component
 */
export interface BaseNodeComponentProps {
  definition: NodeConfig;
  config?: Record<string, any>;
  isSelected?: boolean;
  isExecuting?: boolean;
  hasError?: boolean;
  errorMessage?: string;
  onClick?: () => void;
  onDoubleClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Default node component
 */
export const NodeComponent: React.FC<BaseNodeComponentProps> = ({
  definition,
  config = {},
  isSelected = false,
  isExecuting = false,
  hasError = false,
  errorMessage,
  onClick,
  onDoubleClick,
  className = '',
  children,
}) => {
  // Use custom render if provided
  if (definition.renderNode) {
    const renderProps: NodeRenderProps = {
      node: {
        id: definition.id,
        type: definition.id,
        config,
        position: { x: 0, y: 0 },
      },
      isSelected,
      isExecuting,
      hasError,
      errorMessage,
    };
    return <>{definition.renderNode(renderProps)}</>;
  }

  // Default node styling
  const baseClasses = 'rounded-lg border-2 p-4 min-w-[180px] transition-all duration-200';
  const stateClasses = isSelected
    ? 'border-blue-500 shadow-lg ring-2 ring-blue-200'
    : 'border-gray-200 hover:border-gray-300';
  const executingClasses = isExecuting ? 'animate-pulse border-yellow-400' : '';
  const errorClasses = hasError ? 'border-red-500 bg-red-50' : 'bg-white';

  const inputPorts = definition.inputs.map((input) =>
    typeof input === 'string' ? { name: input, label: input } : input
  );
  const outputPorts = definition.outputs.map((output) =>
    typeof output === 'string' ? { name: output, label: output } : output
  );

  return (
    <div
      className={`${baseClasses} ${stateClasses} ${executingClasses} ${errorClasses} ${className}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      data-node-id={definition.id}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        {definition.icon && (
          <span className="text-gray-600">
            <NodeIcon name={definition.icon} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">
            {definition.name}
          </h3>
          {definition.badge && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${getBadgeClasses(definition.badge.variant)}`}>
              {definition.badge.text}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {definition.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">
          {definition.description}
        </p>
      )}

      {/* Ports */}
      <div className="flex justify-between text-xs">
        {/* Inputs */}
        <div className="space-y-1">
          {inputPorts.map((port) => (
            <div key={port.name} className="flex items-center gap-1 text-gray-600">
              <PortHandle type="input" />
              <span>{port.label || port.name}</span>
            </div>
          ))}
        </div>

        {/* Outputs */}
        <div className="space-y-1">
          {outputPorts.map((port) => (
            <div key={port.name} className="flex items-center gap-1 text-gray-600 justify-end">
              <span>{port.label || port.name}</span>
              <PortHandle type="output" />
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {hasError && errorMessage && (
        <div className="mt-3 text-xs text-red-600 bg-red-100 p-2 rounded">
          {errorMessage}
        </div>
      )}

      {/* Custom content */}
      {children}
    </div>
  );
};

/**
 * Port handle component
 */
interface PortHandleProps {
  type: 'input' | 'output';
}

const PortHandle: React.FC<PortHandleProps> = ({ type }) => {
  return (
    <div
      className={`w-3 h-3 rounded-full border-2 ${
        type === 'input'
          ? 'border-blue-400 bg-blue-100'
          : 'border-green-400 bg-green-100'
      }`}
      data-port-type={type}
    />
  );
};

/**
 * Node icon component (simplified - in real app would use Lucide icons)
 */
interface NodeIconProps {
  name: string;
  size?: number;
  className?: string;
}

export const NodeIcon: React.FC<NodeIconProps> = ({ name, size = 16, className = '' }) => {
  // In a real implementation, this would dynamically load Lucide icons
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <use href={`#${name}`} />
    </svg>
  );
};

/**
 * Get badge CSS classes based on variant
 */
function getBadgeClasses(variant: string = 'default'): string {
  const classes: Record<string, string> = {
    default: 'bg-gray-100 text-gray-800',
    secondary: 'bg-blue-100 text-blue-800',
    destructive: 'bg-red-100 text-red-800',
    outline: 'border border-gray-300 text-gray-700',
  };
  return classes[variant] || classes.default;
}

/**
 * Node preview component for the palette
 */
export interface NodePreviewProps {
  definition: NodeConfig;
  onDragStart?: (e: React.DragEvent) => void;
  className?: string;
}

export const NodePreview: React.FC<NodePreviewProps> = ({
  definition,
  onDragStart,
  className = '',
}) => {
  return (
    <div
      className={`p-3 bg-white border border-gray-200 rounded-lg cursor-move hover:border-blue-400 hover:shadow-sm transition-all ${className}`}
      draggable
      onDragStart={onDragStart}
      data-node-type={definition.id}
    >
      <div className="flex items-center gap-2">
        {definition.icon && (
          <span className="text-gray-500">
            <NodeIcon name={definition.icon} size={18} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {definition.name}
          </h4>
          {definition.description && (
            <p className="text-xs text-gray-500 truncate">
              {definition.description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Node category section for palette
 */
export interface NodeCategoryProps {
  category: string;
  nodes: NodeConfig[];
  onNodeDragStart?: (e: React.DragEvent, node: NodeConfig) => void;
  isExpanded?: boolean;
}

export const NodeCategory: React.FC<NodeCategoryProps> = ({
  category,
  nodes,
  onNodeDragStart,
  isExpanded = true,
}) => {
  const [expanded, setExpanded] = React.useState(isExpanded);

  return (
    <div className="mb-4">
      <button
        className="flex items-center gap-2 w-full text-left px-2 py-1 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        {category}
        <span className="text-gray-400 text-xs">({nodes.length})</span>
      </button>
      
      {expanded && (
        <div className="mt-2 space-y-2 pl-4">
          {nodes.map((node) => (
            <NodePreview
              key={node.id}
              definition={node}
              onDragStart={(e) => onNodeDragStart?.(e, node)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Node palette component
 */
export interface NodePaletteProps {
  nodes: NodeConfig[];
  searchQuery?: string;
  onNodeDragStart?: (e: React.DragEvent, node: NodeConfig) => void;
  className?: string;
}

export const NodePalette: React.FC<NodePaletteProps> = ({
  nodes,
  searchQuery = '',
  onNodeDragStart,
  className = '',
}) => {
  // Group nodes by category
  const nodesByCategory = React.useMemo(() => {
    const filtered = searchQuery
      ? nodes.filter(
          (n) =>
            n.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            n.tags?.some((t) =>
              t.toLowerCase().includes(searchQuery.toLowerCase())
            )
        )
      : nodes;

    return filtered.reduce((acc, node) => {
      const cat = node.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(node);
      return acc;
    }, {} as Record<string, NodeConfig[]>);
  }, [nodes, searchQuery]);

  return (
    <div className={`p-4 overflow-y-auto ${className}`}>
      {Object.entries(nodesByCategory).map(([category, categoryNodes]) => (
        <NodeCategory
          key={category}
          category={category}
          nodes={categoryNodes}
          onNodeDragStart={onNodeDragStart}
        />
      ))}
      
      {Object.keys(nodesByCategory).length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No nodes found
        </div>
      )}
    </div>
  );
};

export default NodeComponent;
