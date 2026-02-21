/**
 * NodeDefinition Class
 * Base class and factory for creating node definitions
 */

import { 
  NodeConfig, 
  PropertyConfig, 
  PortConfig,
  ExecuteFunction,
  NodeContext,
  NodeInputs,
  NodeOutputs,
  ValidationResult,
  ValidationError,
  NodeConfigSchema,
  NodeBadge
} from '../types/node';
import { z } from 'zod';

/**
 * Builder class for constructing node definitions with a fluent API
 */
export class NodeDefinitionBuilder {
  private config: Partial<NodeConfig> = {
    inputs: [],
    outputs: [],
    properties: [],
    tags: [],
  };

  constructor(id?: string) {
    if (id) {
      this.config.id = id;
    }
  }

  /**
   * Set the node ID (required)
   */
  setId(id: string): this {
    this.config.id = id;
    return this;
  }

  /**
   * Set the display name
   */
  setName(name: string): this {
    this.config.name = name;
    return this;
  }

  /**
   * Set the category
   */
  setCategory(category: string): this {
    this.config.category = category;
    return this;
  }

  /**
   * Set the icon (Lucide icon name)
   */
  setIcon(icon: string): this {
    this.config.icon = icon;
    return this;
  }

  /**
   * Set the description
   */
  setDescription(description: string): this {
    this.config.description = description;
    return this;
  }

  /**
   * Set the version
   */
  setVersion(version: string): this {
    this.config.version = version;
    return this;
  }

  /**
   * Set the author
   */
  setAuthor(author: string): this {
    this.config.author = author;
    return this;
  }

  /**
   * Add tags
   */
  addTags(...tags: string[]): this {
    this.config.tags = [...(this.config.tags || []), ...tags];
    return this;
  }

  /**
   * Set a badge for the node
   */
  setBadge(badge: NodeBadge): this {
    this.config.badge = badge;
    return this;
  }

  /**
   * Add an input port
   */
  addInput(input: string | PortConfig): this {
    this.config.inputs = [...(this.config.inputs || []), input];
    return this;
  }

  /**
   * Add multiple input ports
   */
  addInputs(...inputs: (string | PortConfig)[]): this {
    this.config.inputs = [...(this.config.inputs || []), ...inputs];
    return this;
  }

  /**
   * Add an output port
   */
  addOutput(output: string | PortConfig): this {
    this.config.outputs = [...(this.config.outputs || []), output];
    return this;
  }

  /**
   * Add multiple output ports
   */
  addOutputs(...outputs: (string | PortConfig)[]): this {
    this.config.outputs = [...(this.config.outputs || []), ...outputs];
    return this;
  }

  /**
   * Add a property configuration
   */
  addProperty(property: PropertyConfig): this {
    this.config.properties = [...(this.config.properties || []), property];
    return this;
  }

  /**
   * Add multiple properties
   */
  addProperties(...properties: PropertyConfig[]): this {
    this.config.properties = [...(this.config.properties || []), ...properties];
    return this;
  }

  /**
   * Set the execute function
   */
  setExecute(execute: ExecuteFunction): this {
    this.config.execute = execute;
    return this;
  }

  /**
   * Set a custom validation function
   */
  setValidate(validate: (config: Record<string, any>) => void | Promise<void>): this {
    this.config.validate = validate;
    return this;
  }

  /**
   * Set a Zod validation schema
   */
  setValidationSchema(schema: z.ZodType<any>): this {
    this.config.validationSchema = schema;
    return this;
  }

  /**
   * Set the init hook
   */
  setOnInit(onInit: (context: NodeContext) => Promise<void>): this {
    this.config.onInit = onInit;
    return this;
  }

  /**
   * Set the destroy hook
   */
  setOnDestroy(onDestroy: (context: NodeContext) => Promise<void>): this {
    this.config.onDestroy = onDestroy;
    return this;
  }

  /**
   * Set dynamic inputs function
   */
  setDynamicInputs(getter: (config: Record<string, any>) => (string | PortConfig)[]): this {
    this.config.getDynamicInputs = getter;
    return this;
  }

  /**
   * Set dynamic outputs function
   */
  setDynamicOutputs(getter: (config: Record<string, any>) => (string | PortConfig)[]): this {
    this.config.getDynamicOutputs = getter;
    return this;
  }

  /**
   * Set dynamic properties function
   */
  setDynamicProperties(getter: (config: Record<string, any>) => PropertyConfig[]): this {
    this.config.getDynamicProperties = getter;
    return this;
  }

  /**
   * Set documentation
   */
  setDocumentation(documentation: NodeConfig['documentation']): this {
    this.config.documentation = documentation;
    return this;
  }

  /**
   * Build and return the final NodeConfig
   */
  build(): NodeConfig {
    if (!this.config.id) {
      throw new Error('Node ID is required');
    }
    if (!this.config.name) {
      throw new Error('Node name is required');
    }
    if (!this.config.category) {
      throw new Error('Node category is required');
    }
    if (!this.config.execute) {
      throw new Error('Execute function is required');
    }

    return this.config as NodeConfig;
  }
}

/**
 * NodeDefinition class - wraps a NodeConfig with additional methods
 */
export class NodeDefinition {
  public readonly config: NodeConfig;

  constructor(config: NodeConfig) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Get the node ID
   */
  get id(): string {
    return this.config.id;
  }

  /**
   * Get the node name
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Get the category
   */
  get category(): string {
    return this.config.category;
  }

  /**
   * Get inputs (including dynamic ones if configured)
   */
  getInputs(nodeConfig?: Record<string, any>): (string | PortConfig)[] {
    const baseInputs = this.config.inputs || [];
    if (this.config.getDynamicInputs && nodeConfig) {
      return [...baseInputs, ...this.config.getDynamicInputs(nodeConfig)];
    }
    return baseInputs;
  }

  /**
   * Get outputs (including dynamic ones if configured)
   */
  getOutputs(nodeConfig?: Record<string, any>): (string | PortConfig)[] {
    const baseOutputs = this.config.outputs || [];
    if (this.config.getDynamicOutputs && nodeConfig) {
      return [...baseOutputs, ...this.config.getDynamicOutputs(nodeConfig)];
    }
    return baseOutputs;
  }

  /**
   * Get properties (including dynamic ones if configured)
   */
  getProperties(nodeConfig?: Record<string, any>): PropertyConfig[] {
    const baseProperties = this.config.properties || [];
    if (this.config.getDynamicProperties && nodeConfig) {
      return [...baseProperties, ...this.config.getDynamicProperties(nodeConfig)];
    }
    return baseProperties;
  }

  /**
   * Validate node configuration
   */
  async validate(configuration: Record<string, any>): Promise<ValidationResult> {
    const errors: ValidationError[] = [];

    // Run Zod schema validation if defined
    if (this.config.validationSchema) {
      const result = this.config.validationSchema.safeParse(configuration);
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({
            path: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          });
        }
      }
    }

    // Run custom validation if defined
    if (this.config.validate) {
      try {
        await this.config.validate(configuration);
      } catch (error: any) {
        errors.push({
          path: '',
          message: error.message,
          code: 'custom',
        });
      }
    }

    // Validate required properties
    for (const prop of this.config.properties) {
      if (prop.required) {
        const value = configuration[prop.name];
        if (value === undefined || value === null || value === '') {
          errors.push({
            path: prop.name,
            message: `${prop.label} is required`,
            code: 'required',
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute the node
   */
  async execute(context: NodeContext, inputs: NodeInputs): Promise<NodeOutputs> {
    return await this.config.execute(context, inputs);
  }

  /**
   * Initialize the node
   */
  async init(context: NodeContext): Promise<void> {
    if (this.config.onInit) {
      await this.config.onInit(context);
    }
  }

  /**
   * Cleanup the node
   */
  async destroy(context: NodeContext): Promise<void> {
    if (this.config.onDestroy) {
      await this.config.onDestroy(context);
    }
  }

  /**
   * Get default values for all properties
   */
  getDefaultValues(): Record<string, any> {
    const defaults: Record<string, any> = {};
    for (const prop of this.config.properties) {
      if (prop.default !== undefined) {
        defaults[prop.name] = prop.default;
      }
    }
    return defaults;
  }

  /**
   * Validate the node configuration structure
   */
  private validateConfig(): void {
    const result = NodeConfigSchema.safeParse(this.config);
    if (!result.success) {
      const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid node configuration:\n${messages.join('\n')}`);
    }
  }

  /**
   * Serialize to plain object
   */
  toJSON(): NodeConfig {
    return { ...this.config };
  }

  /**
   * Create a clone of this definition
   */
  clone(): NodeDefinition {
    return new NodeDefinition({ ...this.config });
  }
}

/**
 * Factory function to create a node definition from config
 */
export function defineNode(config: NodeConfig): NodeDefinition {
  return new NodeDefinition(config);
}

/**
 * Create a new node definition builder
 */
export function createNodeBuilder(id?: string): NodeDefinitionBuilder {
  return new NodeDefinitionBuilder(id);
}

export default NodeDefinition;
