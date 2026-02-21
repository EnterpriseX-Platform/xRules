'use client';

import { create } from 'zustand';
import { FlowNode, FlowEdge, NodeType, NodeData } from '@/types';
import { generateId } from '@/lib/utils';

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: FlowNode | null;
  selectedEdge: FlowEdge | null;
  isDirty: boolean;
  
  // Actions
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, data?: Partial<NodeData>) => void;
  updateNode: (id: string, updates: Partial<FlowNode>) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: Omit<FlowEdge, 'id'>) => void;
  removeEdge: (id: string) => void;
  setSelectedNode: (node: FlowNode | null) => void;
  setSelectedEdge: (edge: FlowEdge | null) => void;
  setIsDirty: (isDirty: boolean) => void;
  resetFlow: () => void;
  loadFlow: (nodes: FlowNode[], edges: FlowEdge[]) => void;
}

const initialState = {
  nodes: [],
  edges: [],
  selectedNode: null,
  selectedEdge: null,
  isDirty: false,
};

export const useFlowStore = create<FlowState>((set, get) => ({
  ...initialState,

  setNodes: (nodes) => set({ nodes, isDirty: true }),

  setEdges: (edges) => set({ edges, isDirty: true }),

  addNode: (type, position, data = {}) => {
    const id = generateId();
    const newNode: FlowNode = {
      id,
      type,
      position,
      data: {
        label: type.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        ...data,
      },
    };
    set((state) => ({
      nodes: [...state.nodes, newNode],
      isDirty: true,
    }));
    return id;
  },

  updateNode: (id, updates) =>
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
      selectedNode:
        state.selectedNode?.id === id
          ? { ...state.selectedNode, ...updates }
          : state.selectedNode,
      isDirty: true,
    })),

  updateNodeData: (id, data) =>
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      selectedNode:
        state.selectedNode?.id === id
          ? { ...state.selectedNode, data: { ...state.selectedNode.data, ...data } }
          : state.selectedNode,
      isDirty: true,
    })),

  removeNode: (id) =>
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== id),
      edges: state.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNode: state.selectedNode?.id === id ? null : state.selectedNode,
      isDirty: true,
    })),

  addEdge: (edge) => {
    const id = generateId();
    set((state) => ({
      edges: [...state.edges, { ...edge, id }],
      isDirty: true,
    }));
  },

  removeEdge: (id) =>
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== id),
      selectedEdge: state.selectedEdge?.id === id ? null : state.selectedEdge,
      isDirty: true,
    })),

  setSelectedNode: (node) => set({ selectedNode: node, selectedEdge: null }),

  setSelectedEdge: (edge) => set({ selectedEdge: edge, selectedNode: null }),

  setIsDirty: (isDirty) => set({ isDirty }),

  resetFlow: () => set(initialState),

  loadFlow: (nodes, edges) =>
    set({
      nodes,
      edges,
      selectedNode: null,
      selectedEdge: null,
      isDirty: false,
    }),
}));
