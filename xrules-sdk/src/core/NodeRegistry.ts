/**
 * NodeRegistry
 * Central registry for managing custom node definitions
 */

import { NodeConfig, RegisteredNode, NodeRegistryConfig } from '../types/node';
import NodeDefinition from './NodeDefinition';

/**
 * Event types for registry events
 */
export type RegistryEventType = 'register' | 'unregister' | 'update' | 'clear';

export interface RegistryEvent {
  type: RegistryEventType;
  nodeId?: string;
  node?: NodeDefinition;
  timestamp: Date;
}

export type RegistryEventHandler = (event: RegistryEvent) => void;

/**
 * Central registry for node definitions
 */
export class NodeRegistry {
  private static nodes: Map<string, RegisteredNode> = new Map();
  private static categories: Map<string, Set<string>> = new Map();
  private static eventHandlers: Set<RegistryEventHandler> = new Set();
  private static config: NodeRegistryConfig = {
    allowOverrides: false,
    validateOnRegister: true,
  };

  /**
   * Configure the registry
   */
  static configure(config: NodeRegistryConfig): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Register a node definition
   */
  static register(node: NodeConfig | NodeDefinition, metadata?: Partial<RegisteredNode['metadata']>): NodeDefinition {
    const definition = node instanceof NodeDefinition ? node : new NodeDefinition(node);
    const nodeId = definition.id;

    // Check for existing registration
    if (this.nodes.has(nodeId) && !this.config.allowOverrides) {
      throw new Error(`Node with ID "${nodeId}" is already registered. Set allowOverrides to true to allow replacement.`);
    }

    // Validate if enabled
    if (this.config.validateOnRegister) {
      this.validateNode(definition);
    }

    // Create registration
    const registration: RegisteredNode = {
      definition: definition.toJSON(),
      metadata: {
        registeredAt: new Date(),
        ...metadata,
      },
    };

    // Store the node
    this.nodes.set(nodeId, registration);

    // Update category index
    const category = definition.category;
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(nodeId);

    // Notify callbacks
    this.emitEvent({
      type: this.nodes.has(nodeId) ? 'update' : 'register',
      nodeId,
      node: definition,
      timestamp: new Date(),
    });

    // Call custom handler
    if (this.config.onRegister) {
      this.config.onRegister(definition.toJSON());
    }

    return definition;
  }

  /**
   * Unregister a node by ID
   */
  static unregister(nodeId: string): boolean {
    const registration = this.nodes.get(nodeId);
    if (!registration) {
      return false;
    }

    // Remove from category index
    const category = registration.definition.category;
    const categorySet = this.categories.get(category);
    if (categorySet) {
      categorySet.delete(nodeId);
      if (categorySet.size === 0) {
        this.categories.delete(category);
      }
    }

    // Remove the node
    this.nodes.delete(nodeId);

    // Notify callbacks
    this.emitEvent({
      type: 'unregister',
      nodeId,
      timestamp: new Date(),
    });

    // Call custom handler
    if (this.config.onUnregister) {
      this.config.onUnregister(nodeId);
    }

    return true;
  }

  /**
   * Get a node definition by ID
   */
  static get(nodeId: string): NodeDefinition | undefined {
    const registration = this.nodes.get(nodeId);
    if (!registration) {
      return undefined;
    }
    return new NodeDefinition(registration.definition);
  }

  /**
   * Check if a node is registered
   */
  static has(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  /**
   * Get all registered nodes
   */
  static getAll(): NodeDefinition[] {
    return Array.from(this.nodes.values()).map(
      (reg) => new NodeDefinition(reg.definition)
    );
  }

  /**
   * Get all node IDs
   */
  static getAllIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Get nodes by category
   */
  static getByCategory(category: string): NodeDefinition[] {
    const nodeIds = this.categories.get(category);
    if (!nodeIds) {
      return [];
    }
    return Array.from(nodeIds)
      .map((id) => this.get(id))
      .filter((node): node is NodeDefinition => node !== undefined);
  }

  /**
   * Get all categories
   */
  static getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  /**
   * Get categories with node counts
   */
  static getCategoryCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [category, nodeIds] of this.categories.entries()) {
      counts[category] = nodeIds.size;
    }
    return counts;
  }

  /**
   * Search nodes by name or tags
   */
  static search(query: string): NodeDefinition[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter((node) => {
      const nameMatch = node.name.toLowerCase().includes(lowerQuery);
      const tagMatch = node.config.tags?.some((tag) =>
        tag.toLowerCase().includes(lowerQuery)
      );
      const descMatch = node.config.description?.toLowerCase().includes(lowerQuery);
      return nameMatch || tagMatch || descMatch;
    });
  }

  /**
   * Filter nodes by criteria
   */
  static filter(predicate: (node: NodeDefinition) => boolean): NodeDefinition[] {
    return this.getAll().filter(predicate);
  }

  /**
   * Clear all registered nodes
   */
  static clear(): void {
    this.nodes.clear();
    this.categories.clear();
    this.emitEvent({
      type: 'clear',
      timestamp: new Date(),
    });
  }

  /**
   * Get the number of registered nodes
   */
  static size(): number {
    return this.nodes.size;
  }

  /**
   * Register multiple nodes at once
   */
  static registerMany(nodes: (NodeConfig | NodeDefinition)[], metadata?: Partial<RegisteredNode['metadata']>): NodeDefinition[] {
    return nodes.map((node) => this.register(node, metadata));
  }

  /**
   * Unregister multiple nodes at once
   */
  static unregisterMany(nodeIds: string[]): number {
    let count = 0;
    for (const id of nodeIds) {
      if (this.unregister(id)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Subscribe to registry events
   */
  static subscribe(handler: RegistryEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => {
      this.eventHandlers.delete(handler);
    };
  }

  /**
   * Unsubscribe from registry events
   */
  static unsubscribe(handler: RegistryEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  /**
   * Get registration metadata for a node
   */
  static getMetadata(nodeId: string): RegisteredNode['metadata'] | undefined {
    return this.nodes.get(nodeId)?.metadata;
  }

  /**
   * Export all nodes as JSON
   */
  static toJSON(): Record<string, RegisteredNode> {
    const result: Record<string, RegisteredNode> = {};
    for (const [id, registration] of this.nodes.entries()) {
      result[id] = {
        definition: registration.definition,
        metadata: registration.metadata,
      };
    }
    return result;
  }

  /**
   * Import nodes from JSON
   */
  static fromJSON(data: Record<string, RegisteredNode>): void {
    for (const [id, registration] of Object.entries(data)) {
      this.nodes.set(id, registration);
      
      // Update category index
      const category = registration.definition.category;
      if (!this.categories.has(category)) {
        this.categories.set(category, new Set());
      }
      this.categories.get(category)!.add(id);
    }
  }

  /**
   * Create a package manifest for the registered nodes
   */
  static createPackageManifest(packageName: string, version: string): object {
    const nodes = this.getAll();
    return {
      name: packageName,
      version,
      nodeCount: nodes.length,
      categories: this.getCategoryCounts(),
      nodes: nodes.map((node) => ({
        id: node.id,
        name: node.name,
        category: node.category,
        description: node.config.description,
        version: node.config.version,
        inputs: node.config.inputs.map((i) =>
          typeof i === 'string' ? i : i.name
        ),
        outputs: node.config.outputs.map((o) =>
          typeof o === 'string' ? o : o.name
        ),
      })),
    };
  }

  /**
   * Validate a node definition
   */
  private static validateNode(node: NodeDefinition): void {
    // Check for reserved IDs
    const reservedIds = ['start', 'end', 'input', 'output'];
    if (reservedIds.includes(node.id)) {
      throw new Error(`"${node.id}" is a reserved node ID`);
    }

    // Check ID format
    if (!/^[a-z0-9-]+$/.test(node.id)) {
      throw new Error(
        `Node ID "${node.id}" must contain only lowercase letters, numbers, and hyphens`
      );
    }

    // Check for duplicate property names
    const propertyNames = new Set<string>();
    for (const prop of node.config.properties) {
      if (propertyNames.has(prop.name)) {
        throw new Error(
          `Duplicate property name "${prop.name}" in node "${node.id}"`
        );
      }
      propertyNames.add(prop.name);
    }

    // Check for duplicate port names
    const inputNames = new Set<string>();
    for (const input of node.config.inputs) {
      const name = typeof input === 'string' ? input : input.name;
      if (inputNames.has(name)) {
        throw new Error(`Duplicate input name "${name}" in node "${node.id}"`);
      }
      inputNames.add(name);
    }

    const outputNames = new Set<string>();
    for (const output of node.config.outputs) {
      const name = typeof output === 'string' ? output : output.name;
      if (outputNames.has(name)) {
        throw new Error(`Duplicate output name "${name}" in node "${node.id}"`);
      }
      outputNames.add(name);
    }
  }

  /**
   * Emit an event to all subscribers
   */
  private static emitEvent(event: RegistryEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in registry event handler:', error);
      }
    }
  }
}

export default NodeRegistry;
