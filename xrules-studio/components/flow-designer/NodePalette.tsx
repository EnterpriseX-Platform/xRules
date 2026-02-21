'use client';

import { useCallback } from 'react';
import {
  Globe,
  ArrowRightToLine,
  Database,
  Globe2,
  GitBranch,
  Wand2,
  FolderSync,
  Clock,
  Inbox,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { NodeType } from '@/types';

interface NodeItem {
  type: NodeType;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  category: 'triggers' | 'actions' | 'logic' | 'data';
}

const nodeItems: NodeItem[] = [
  {
    type: 'api-input',
    label: 'API Input',
    description: 'HTTP request entry point',
    icon: Globe,
    color: 'bg-blue-500',
    category: 'triggers',
  },
  {
    type: 'schedule-trigger',
    label: 'Schedule',
    description: 'Cron-based trigger',
    icon: Clock,
    color: 'bg-teal-500',
    category: 'triggers',
  },
  {
    type: 'basket-trigger',
    label: 'Basket',
    description: 'File basket trigger',
    icon: Inbox,
    color: 'bg-indigo-500',
    category: 'triggers',
  },
  {
    type: 'database',
    label: 'Database',
    description: 'SQL operations',
    icon: Database,
    color: 'bg-purple-500',
    category: 'actions',
  },
  {
    type: 'http',
    label: 'HTTP',
    description: 'API calls',
    icon: Globe2,
    color: 'bg-cyan-500',
    category: 'actions',
  },
  {
    type: 'sftp',
    label: 'SFTP',
    description: 'File transfers',
    icon: FolderSync,
    color: 'bg-orange-500',
    category: 'actions',
  },
  {
    type: 'api-output',
    label: 'API Output',
    description: 'HTTP response',
    icon: ArrowRightToLine,
    color: 'bg-green-500',
    category: 'actions',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'If/else branching',
    icon: GitBranch,
    color: 'bg-amber-500',
    category: 'logic',
  },
  {
    type: 'transform',
    label: 'Transform',
    description: 'Data mapping',
    icon: Wand2,
    color: 'bg-pink-500',
    category: 'data',
  },
];

interface NodePaletteProps {
  className?: string;
  onDragStart?: (type: NodeType) => void;
}

export function NodePalette({ className, onDragStart }: NodePaletteProps) {
  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>, nodeType: NodeType) => {
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'move';
      onDragStart?.(nodeType);
    },
    [onDragStart]
  );

  const categories = {
    triggers: 'Triggers',
    actions: 'Actions',
    logic: 'Logic',
    data: 'Data',
  };

  const groupedNodes = nodeItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, NodeItem[]>);

  return (
    <div className={cn('flex h-full flex-col border-r bg-card', className)}>
      <div className="border-b p-4">
        <h3 className="font-semibold">Node Palette</h3>
        <p className="text-xs text-muted-foreground">Drag nodes to canvas</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {Object.entries(groupedNodes).map(([category, items]) => (
            <div key={category}>
              <h4 className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                {categories[category as keyof typeof categories]}
              </h4>
              <div className="space-y-1">
                {items.map((item) => (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    className="group flex cursor-grab items-center gap-3 rounded-md border bg-background p-2.5 transition-colors hover:border-primary hover:bg-accent active:cursor-grabbing"
                  >
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                        item.color.replace('bg-', 'bg-').replace('500', '500/10')
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4',
                          item.color.replace('bg-', 'text-')
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
