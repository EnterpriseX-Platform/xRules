/**
 * Validation utilities for node configurations
 */

import { z } from 'zod';
import {
  NodeConfig,
  PropertyConfig,
  ValidationResult,
  ValidationError,
  PortConfig,
} from '../types/node';

/**
 * Zod schema for port configuration
 */
export const PortConfigSchema = z.object({
  name: z.string().min(1, 'Port name is required'),
  label: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  multiple: z.boolean().optional(),
});

/**
 * Zod schema for property configuration
 */
export const PropertyConfigSchema = z.object({
  name: z.string().min(1, 'Property name is required'),
  type: z.enum([
    'string',
    'number',
    'boolean',
    'select',
    'multiselect',
    'json',
    'code',
    'connection',
    'date',
    'datetime',
    'file',
    'secret',
  ]),
  label: z.string().min(1, 'Property label is required'),
  description: z.string().optional(),
  required: z.boolean().optional(),
  default: z.any().optional(),
  placeholder: z.string().optional(),
  hidden: z.union([z.boolean(), z.function()]).optional(),
  disabled: z.union([z.boolean(), z.function()]).optional(),
});

/**
 * Zod schema for node configuration
 */
export const NodeConfigSchema = z.object({
  id: z
    .string()
    .min(1, 'Node ID is required')
    .regex(/^[a-z0-9-]+$/, 'Node ID must contain only lowercase letters, numbers, and hyphens'),
  name: z.string().min(1, 'Node name is required'),
  category: z.string().min(1, 'Category is required'),
  icon: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  
  inputs: z.array(z.union([z.string(), PortConfigSchema])),
  outputs: z.array(z.union([z.string(), PortConfigSchema])),
  properties: z.array(PropertyConfigSchema),
  
  execute: z.function().optional(),
  validate: z.function().optional(),
  validationSchema: z.instanceof(z.ZodType).optional(),
  
  onInit: z.function().optional(),
  onDestroy: z.function().optional(),
  getDynamicInputs: z.function().optional(),
  getDynamicOutputs: z.function().optional(),
  getDynamicProperties: z.function().optional(),
});

/**
 * Validate a node configuration
 */
export function validateNodeConfig(config: NodeConfig): ValidationResult {
  const errors: ValidationError[] = [];

  // Run Zod schema validation
  const result = NodeConfigSchema.safeParse(config);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      });
    }
  }

  // Check for duplicate property names
  const propertyNames = new Set<string>();
  for (const prop of config.properties) {
    if (propertyNames.has(prop.name)) {
      errors.push({
        path: `properties.${prop.name}`,
        message: `Duplicate property name "${prop.name}"`,
        code: 'duplicate_property',
      });
    }
    propertyNames.add(prop.name);
  }

  // Check for duplicate port names
  const inputNames = new Set<string>();
  for (const input of config.inputs) {
    const name = typeof input === 'string' ? input : input.name;
    if (inputNames.has(name)) {
      errors.push({
        path: `inputs.${name}`,
        message: `Duplicate input name "${name}"`,
        code: 'duplicate_input',
      });
    }
    inputNames.add(name);
  }

  const outputNames = new Set<string>();
  for (const output of config.outputs) {
    const name = typeof output === 'string' ? output : output.name;
    if (outputNames.has(name)) {
      errors.push({
        path: `outputs.${name}`,
        message: `Duplicate output name "${name}"`,
        code: 'duplicate_output',
      });
    }
    outputNames.add(name);
  }

  // Check for reserved IDs
  const reservedIds = ['start', 'end', 'input', 'output', 'node'];
  if (reservedIds.includes(config.id)) {
    errors.push({
      path: 'id',
      message: `"${config.id}" is a reserved node ID`,
      code: 'reserved_id',
    });
  }

  // Validate property defaults match their types
  for (const prop of config.properties) {
    if (prop.default !== undefined) {
      const defaultError = validatePropertyDefault(prop);
      if (defaultError) {
        errors.push(defaultError);
      }
    }
  }

  // Run custom validation if provided
  if (config.validate && typeof config.validate === 'function') {
    try {
      // We can't run the actual validation here as it needs the config values
      // This is just a check that the function exists
    } catch (error: any) {
      errors.push({
        path: 'validate',
        message: `Custom validation error: ${error.message}`,
        code: 'custom_validation',
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a property default value matches its type
 */
function validatePropertyDefault(prop: PropertyConfig): ValidationError | null {
  const defaultValue = prop.default;

  switch (prop.type) {
    case 'string':
      if (typeof defaultValue !== 'string') {
        return {
          path: `properties.${prop.name}.default`,
          message: `Default value for "${prop.name}" must be a string`,
          code: 'invalid_default',
        };
      }
      break;

    case 'number':
      if (typeof defaultValue !== 'number') {
        return {
          path: `properties.${prop.name}.default`,
          message: `Default value for "${prop.name}" must be a number`,
          code: 'invalid_default',
        };
      }
      break;

    case 'boolean':
      if (typeof defaultValue !== 'boolean') {
        return {
          path: `properties.${prop.name}.default`,
          message: `Default value for "${prop.name}" must be a boolean`,
          code: 'invalid_default',
        };
      }
      break;

    case 'json':
      if (defaultValue !== null && typeof defaultValue !== 'object') {
        return {
          path: `properties.${prop.name}.default`,
          message: `Default value for "${prop.name}" must be an object or null`,
          code: 'invalid_default',
        };
      }
      break;

    case 'select':
      // Check if default is in options
      const selectProp = prop as any;
      if (selectProp.options) {
        const optionValues = Array.isArray(selectProp.options)
          ? selectProp.options.map((opt: any) =>
              typeof opt === 'string' ? opt : opt.value
            )
          : [];
        if (!optionValues.includes(defaultValue)) {
          return {
            path: `properties.${prop.name}.default`,
            message: `Default value for "${prop.name}" must be one of the options`,
            code: 'invalid_default',
          };
        }
      }
      break;

    case 'multiselect':
      if (!Array.isArray(defaultValue)) {
        return {
          path: `properties.${prop.name}.default`,
          message: `Default value for "${prop.name}" must be an array`,
          code: 'invalid_default',
        };
      }
      break;
  }

  return null;
}

/**
 * Validate property values against their configuration
 */
export function validatePropertyValues(
  properties: PropertyConfig[],
  values: Record<string, any>
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const prop of properties) {
    const value = values[prop.name];

    // Check required
    if (prop.required && (value === undefined || value === null || value === '')) {
      errors.push({
        path: prop.name,
        message: `${prop.label} is required`,
        code: 'required',
      });
      continue;
    }

    // Skip further validation if value is empty and not required
    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Type-specific validation
    switch (prop.type) {
      case 'string': {
        if (typeof value !== 'string') {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be a string`,
            code: 'invalid_type',
          });
        }
        break;
      }

      case 'number': {
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be a number`,
            code: 'invalid_type',
          });
        } else {
          const numProp = prop as any;
          if (numProp.min !== undefined && value < numProp.min) {
            errors.push({
              path: prop.name,
              message: `${prop.label} must be at least ${numProp.min}`,
              code: 'min_value',
            });
          }
          if (numProp.max !== undefined && value > numProp.max) {
            errors.push({
              path: prop.name,
              message: `${prop.label} must be at most ${numProp.max}`,
              code: 'max_value',
            });
          }
        }
        break;
      }

      case 'boolean': {
        if (typeof value !== 'boolean') {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be a boolean`,
            code: 'invalid_type',
          });
        }
        break;
      }

      case 'json': {
        if (typeof value !== 'object') {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be a valid JSON object`,
            code: 'invalid_type',
          });
        }
        break;
      }

      case 'select': {
        const selectProp = prop as any;
        if (selectProp.options) {
          const optionValues = Array.isArray(selectProp.options)
            ? selectProp.options.map((opt: any) =>
                typeof opt === 'string' ? opt : opt.value
              )
            : [];
          if (!optionValues.includes(value)) {
            errors.push({
              path: prop.name,
              message: `${prop.label} must be one of the allowed options`,
              code: 'invalid_option',
            });
          }
        }
        break;
      }

      case 'multiselect': {
        if (!Array.isArray(value)) {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be an array`,
            code: 'invalid_type',
          });
        }
        break;
      }

      case 'code': {
        if (typeof value !== 'string') {
          errors.push({
            path: prop.name,
            message: `${prop.label} must be a string`,
            code: 'invalid_type',
          });
        }
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a validation schema builder helper
 */
export class ValidationSchemaBuilder {
  private schema: z.ZodObject<any> = z.object({});

  string(name: string, config?: { min?: number; max?: number; email?: boolean; url?: boolean }) {
    let schema: z.ZodString = z.string();
    
    if (config?.min !== undefined) {
      schema = schema.min(config.min);
    }
    if (config?.max !== undefined) {
      schema = schema.max(config.max);
    }
    if (config?.email) {
      schema = schema.email();
    }
    if (config?.url) {
      schema = schema.url();
    }

    this.schema = this.schema.extend({ [name]: schema });
    return this;
  }

  number(name: string, config?: { min?: number; max?: number; int?: boolean }) {
    let schema: z.ZodNumber = z.number();
    
    if (config?.min !== undefined) {
      schema = schema.min(config.min);
    }
    if (config?.max !== undefined) {
      schema = schema.max(config.max);
    }
    if (config?.int) {
      schema = schema.int();
    }

    this.schema = this.schema.extend({ [name]: schema });
    return this;
  }

  boolean(name: string) {
    this.schema = this.schema.extend({ [name]: z.boolean() });
    return this;
  }

  enum<T extends string>(name: string, values: T[]) {
    this.schema = this.schema.extend({ [name]: z.enum(values as [T, ...T[]]) });
    return this;
  }

  array<T>(name: string, itemSchema: z.ZodType<T>) {
    this.schema = this.schema.extend({ [name]: z.array(itemSchema) });
    return this;
  }

  object<T extends z.ZodRawShape>(name: string, shape: T) {
    this.schema = this.schema.extend({ [name]: z.object(shape) });
    return this;
  }

  optional<T extends z.ZodType<any>>(name: string, schema: T) {
    this.schema = this.schema.extend({ [name]: schema.optional() });
    return this;
  }

  custom<T extends z.ZodType<any>>(name: string, schema: T) {
    this.schema = this.schema.extend({ [name]: schema });
    return this;
  }

  build(): z.ZodObject<any> {
    return this.schema;
  }
}

/**
 * Create a new validation schema builder
 */
export function createValidationSchema(): ValidationSchemaBuilder {
  return new ValidationSchemaBuilder();
}

/**
 * Common validation patterns
 */
export const ValidationPatterns = {
  // URL pattern
  url: z.string().url(),
  
  // Email pattern
  email: z.string().email(),
  
  // IPv4 address
  ipv4: z.string().regex(
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
  ),
  
  // Port number
  port: z.number().int().min(1).max(65535),
  
  // Hex color
  hexColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  
  // JWT token
  jwt: z.string().regex(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/),
  
  // UUID
  uuid: z.string().uuid(),
  
  // Cron expression (basic)
  cron: z.string().regex(
    /^([\*\d\-\,\/]+)\s+([\*\d\-\,\/]+)\s+([\*\d\-\,\/]+)\s+([\*\d\-\,\/]+)\s+([\*\d\-\,\/]+)$/
  ),
};

export default {
  validateNodeConfig,
  validatePropertyValues,
  createValidationSchema,
  ValidationSchemaBuilder,
  ValidationPatterns,
  NodeConfigSchema,
  PropertyConfigSchema,
  PortConfigSchema,
};
