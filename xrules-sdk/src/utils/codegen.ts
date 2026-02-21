/**
 * Code generation utilities for the XRULES SDK
 * Generate TypeScript code from node configurations
 */

import { NodeConfig, PropertyConfig, PropertyType } from '../types/node';

/**
 * Options for code generation
 */
export interface CodeGenOptions {
  /**
   * Include JSDoc comments
   */
  includeJSDoc?: boolean;
  
  /**
   * Include type exports
   */
  exportTypes?: boolean;
  
  /**
   * Use single quotes
   */
  singleQuotes?: boolean;
  
  /**
   * Indentation (spaces or tabs)
   */
  indent?: string;
  
  /**
   * Include semicolons
   */
  semicolons?: boolean;
  
  /**
   * Module format
   */
  moduleFormat?: 'esm' | 'cjs';
}

/**
 * Default code generation options
 */
const defaultOptions: CodeGenOptions = {
  includeJSDoc: true,
  exportTypes: true,
  singleQuotes: true,
  indent: '  ',
  semicolons: true,
  moduleFormat: 'esm',
};

/**
 * Quote character based on options
 */
function getQuote(options: CodeGenOptions): string {
  return options.singleQuotes ? "'" : '"';
}

/**
 * Semicolon based on options
 */
function getSemicolon(options: CodeGenOptions): string {
  return options.semicolons ? ';' : '';
}

/**
 * Indent string based on level
 */
function indent(level: number, options: CodeGenOptions): string {
  return options.indent!.repeat(level);
}

/**
 * Quote a string
 */
function quote(str: string, options: CodeGenOptions): string {
  const q = getQuote(options);
  return `${q}${str.replace(new RegExp(q, 'g'), '\\' + q)}${q}`;
}

/**
 * Convert a value to its string representation
 */
function valueToString(value: any, options: CodeGenOptions, level: number = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return quote(value, options);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return value.toString();
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map(v => valueToString(v, options, level + 1)).join(', ');
    return `[${items}]`;
  }
  
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    
    const inner = entries
      .map(([k, v]) => {
        const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : quote(k, options);
        const val = valueToString(v, options, level + 1);
        return `${indent(level + 1, options)}${key}: ${val}`;
      })
      .join(',\n');
    
    return `{\n${inner}\n${indent(level, options)}}`;
  }
  
  return String(value);
}

/**
 * Generate TypeScript type for a property
 */
function generatePropertyType(prop: PropertyConfig): string {
  switch (prop.type) {
    case 'string':
    case 'secret':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'json':
      return 'any';
    case 'code':
      return 'string';
    case 'select':
      // Try to extract options as a union type
      const selectProp = prop as any;
      if (selectProp.options && Array.isArray(selectProp.options)) {
        const values = selectProp.options
          .map((opt: any) => {
            const val = typeof opt === 'string' ? opt : opt.value;
            return typeof val === 'string' ? quote({ singleQuotes: true } as any) + val + quote({ singleQuotes: true } as any) : String(val);
          })
          .filter((v: string) => v !== 'undefined');
        if (values.length > 0) {
          return values.join(' | ');
        }
      }
      return 'string';
    case 'multiselect':
      return 'string[]';
    case 'connection':
      return 'string';
    case 'date':
    case 'datetime':
      return 'Date | string';
    case 'file':
      return 'File | string';
    default:
      return 'any';
  }
}

/**
 * Generate properties interface
 */
function generatePropertiesInterface(
  nodeId: string,
  properties: PropertyConfig[],
  options: CodeGenOptions
): string {
  if (properties.length === 0) {
    return '';
  }

  const q = getQuote(options);
  const sc = getSemicolon(options);
  const lines: string[] = [];

  if (options.exportTypes) {
    lines.push(`export interface ${pascalCase(nodeId)}Properties {`);
  } else {
    lines.push(`interface ${pascalCase(nodeId)}Properties {`);
  }

  for (const prop of properties) {
    if (options.includeJSDoc && (prop.description || prop.required !== undefined)) {
      lines.push(`${indent(1, options)}/**`);
      if (prop.description) {
        lines.push(`${indent(1, options)} * ${prop.description}`);
      }
      if (prop.required) {
        lines.push(`${indent(1, options)} * @required`);
      }
      lines.push(`${indent(1, options)} */`);
    }
    
    const optional = prop.required ? '' : '?';
    const type = generatePropertyType(prop);
    lines.push(`${indent(1, options)}${prop.name}${optional}: ${type}${sc}`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate input/output types
 */
function generatePortTypes(
  nodeId: string,
  inputs: (string | { name: string })[],
  outputs: (string | { name: string })[],
  options: CodeGenOptions
): string {
  const sc = getSemicolon(options);
  const lines: string[] = [];

  // Generate Inputs interface
  if (inputs.length > 0) {
    const interfaceName = `${pascalCase(nodeId)}Inputs`;
    if (options.exportTypes) {
      lines.push(`export interface ${interfaceName} {`);
    } else {
      lines.push(`interface ${interfaceName} {`);
    }
    
    for (const input of inputs) {
      const name = typeof input === 'string' ? input : input.name;
      lines.push(`${indent(1, options)}${name}: any${sc}`);
    }
    
    lines.push('}');
    lines.push('');
  }

  // Generate Outputs interface
  if (outputs.length > 0) {
    const interfaceName = `${pascalCase(nodeId)}Outputs`;
    if (options.exportTypes) {
      lines.push(`export interface ${interfaceName} {`);
    } else {
      lines.push(`interface ${interfaceName} {`);
    }
    
    for (const output of outputs) {
      const name = typeof output === 'string' ? output : output.name;
      lines.push(`${indent(1, options)}${name}?: any${sc}`);
    }
    
    lines.push('}');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the node configuration object
 */
function generateNodeConfig(
  config: NodeConfig,
  options: CodeGenOptions
): string {
  const q = getQuote(options);
  const sc = getSemicolon(options);
  const lines: string[] = [];
  const indentStr = indent(1, options);

  lines.push(`{`);
  
  // Basic properties
  lines.push(`${indentStr}id: ${quote(config.id, options)},`);
  lines.push(`${indentStr}name: ${quote(config.name, options)},`);
  lines.push(`${indentStr}category: ${quote(config.category, options)},`);
  
  if (config.icon) {
    lines.push(`${indentStr}icon: ${quote(config.icon, options)},`);
  }
  
  if (config.description) {
    lines.push(`${indentStr}description: ${quote(config.description, options)},`);
  }
  
  if (config.version) {
    lines.push(`${indentStr}version: ${quote(config.version, options)},`);
  }
  
  if (config.author) {
    lines.push(`${indentStr}author: ${quote(config.author, options)},`);
  }
  
  if (config.tags && config.tags.length > 0) {
    lines.push(`${indentStr}tags: [${config.tags.map(t => quote(t, options)).join(', ')}],`);
  }

  // Inputs
  if (config.inputs.length > 0) {
    const inputs = config.inputs.map(i => {
      if (typeof i === 'string') {
        return quote(i, options);
      }
      return valueToString(i, options, 1);
    });
    lines.push(`${indentStr}inputs: [${inputs.join(', ')}],`);
  } else {
    lines.push(`${indentStr}inputs: [],`);
  }

  // Outputs
  if (config.outputs.length > 0) {
    const outputs = config.outputs.map(o => {
      if (typeof o === 'string') {
        return quote(o, options);
      }
      return valueToString(o, options, 1);
    });
    lines.push(`${indentStr}outputs: [${outputs.join(', ')}],`);
  } else {
    lines.push(`${indentStr}outputs: [],`);
  }

  // Properties
  if (config.properties.length > 0) {
    lines.push(`${indentStr}properties: [`);
    for (const prop of config.properties) {
      lines.push(`${indentStr}${indentStr}${valueToString(prop, options, 2)},`);
    }
    lines.push(`${indentStr}],`);
  } else {
    lines.push(`${indentStr}properties: [],`);
  }

  // Execute function placeholder
  lines.push(`${indentStr}execute: async (context, inputs) => {`);
  lines.push(`${indentStr}${indentStr}// TODO: Implement node logic`);
  lines.push(`${indentStr}${indentStr}const { ${config.properties.map(p => p.name).join(', ')} } = context.properties${sc}`);
  lines.push(`${indentStr}${indentStr}`);
  lines.push(`${indentStr}${indentStr}return {`);
  for (const output of config.outputs) {
    const name = typeof output === 'string' ? output : output.name;
    lines.push(`${indentStr}${indentStr}${indentStr}${name}: undefined,`);
  }
  lines.push(`${indentStr}${indentStr}}${sc}`);
  lines.push(`${indentStr}},`);

  lines.push(`}`);

  return lines.join('\n');
}

/**
 * Convert string to PascalCase
 */
function pascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/**
 * Convert string to camelCase
 */
function camelCase(str: string): string {
  const pascal = pascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Generate a complete TypeScript file for a node
 */
export function generateNodeFile(
  config: NodeConfig,
  userOptions: CodeGenOptions = {}
): string {
  const options = { ...defaultOptions, ...userOptions };
  const q = getQuote(options);
  const sc = getSemicolon(options);
  const lines: string[] = [];

  // Import statement
  lines.push(`import { defineNode, NodeContext, NodeInputs, NodeOutputs } from ${quote('@xrules/sdk', options)}${sc}`);
  lines.push('');

  // Generate types
  const propsInterface = generatePropertiesInterface(config.id, config.properties, options);
  if (propsInterface) {
    lines.push(propsInterface);
  }

  const portTypes = generatePortTypes(config.id, config.inputs, config.outputs, options);
  if (portTypes) {
    lines.push(portTypes);
  }

  // Generate node definition
  const nodeName = `${pascalCase(config.id)}Node`;
  const configStr = generateNodeConfig(config, options);
  
  lines.push(`export const ${nodeName} = defineNode(${configStr})${sc}`);
  lines.push('');
  
  lines.push(`export default ${nodeName}${sc}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate a package index file
 */
export function generatePackageIndex(
  nodes: NodeConfig[],
  packageName: string,
  userOptions: CodeGenOptions = {}
): string {
  const options = { ...defaultOptions, ...userOptions };
  const q = getQuote(options);
  const sc = getSemicolon(options);
  const lines: string[] = [];

  // Header comment
  lines.push(`/**`);
  lines.push(` * ${packageName}`);
  lines.push(` * Auto-generated index file`);
  lines.push(` */`);
  lines.push('');

  // Re-export SDK types
  lines.push(`export { defineNode, NodeRegistry, NodeDefinition } from ${quote('@xrules/sdk', options)}${sc}`);
  lines.push(`export type { `);
  lines.push(`  NodeConfig,`);
  lines.push(`  PropertyConfig,`);
  lines.push(`  PortConfig,`);
  lines.push(`  NodeContext,`);
  lines.push(`  NodeInputs,`);
  lines.push(`  NodeOutputs,`);
  lines.push(`} from ${quote('@xrules/sdk', options)}${sc}`);
  lines.push('');

  // Import and re-export nodes
  for (const node of nodes) {
    const nodeFile = `${kebabCase(node.id)}.node`;
    const nodeName = `${pascalCase(node.id)}Node`;
    lines.push(`import { ${nodeName} } from ${quote(`./${nodeFile}`, options)}${sc}`);
  }
  lines.push('');

  // Export nodes array
  lines.push(`export const nodes = [`);
  for (const node of nodes) {
    const nodeName = `${pascalCase(node.id)}Node`;
    lines.push(`  ${nodeName},`);
  }
  lines.push(`]${sc}`);
  lines.push('');

  // Individual exports
  lines.push(`export {`);
  for (const node of nodes) {
    const nodeName = `${pascalCase(node.id)}Node`;
    lines.push(`  ${nodeName},`);
  }
  lines.push(`}${sc}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Convert string to kebab-case
 */
function kebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Generate test file for a node
 */
export function generateTestFile(
  config: NodeConfig,
  userOptions: CodeGenOptions = {}
): string {
  const options = { ...defaultOptions, ...userOptions };
  const q = getQuote(options);
  const sc = getSemicolon(options);
  const lines: string[] = [];

  const nodeName = `${pascalCase(config.id)}Node`;
  const nodeFile = `${kebabCase(config.id)}.node`;

  lines.push(`import { testNode, createTestContext } from ${quote('@xrules/sdk', options)}${sc}`);
  lines.push(`import { ${nodeName} } from ${quote(`../src/${nodeFile}`, options)}${sc}`);
  lines.push('');

  lines.push(`describe(${quote(nodeName, options)}, () => {`);
  lines.push(`  it(${quote('should execute successfully', options)}, async () => {`);
  
  // Generate sample properties
  lines.push(`    const properties = {`);
  for (const prop of config.properties) {
    const defaultValue = prop.default;
    if (defaultValue !== undefined) {
      lines.push(`      ${prop.name}: ${valueToString(defaultValue, options, 2)},`);
    } else if (prop.type === 'string') {
      lines.push(`      ${prop.name}: ${quote('test-value', options)},`);
    } else if (prop.type === 'number') {
      lines.push(`      ${prop.name}: 0,`);
    } else if (prop.type === 'boolean') {
      lines.push(`      ${prop.name}: true,`);
    } else if (prop.type === 'json') {
      lines.push(`      ${prop.name}: {},`);
    } else {
      lines.push(`      ${prop.name}: undefined,`);
    }
  }
  lines.push(`    }${sc}`);
  lines.push('');

  // Generate sample inputs
  lines.push(`    const inputs = {`);
  for (const input of config.inputs) {
    const name = typeof input === 'string' ? input : input.name;
    lines.push(`      ${name}: undefined,`);
  }
  lines.push(`    }${sc}`);
  lines.push('');

  lines.push(`    const result = await testNode(${nodeName}, properties, inputs)${sc}`);
  lines.push('');
  lines.push(`    expect(result.success).toBe(true)${sc}`);
  lines.push(`  })${sc}`);
  lines.push(`})${sc}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate README for a node package
 */
export function generateReadme(
  nodes: NodeConfig[],
  packageName: string,
  description?: string
): string {
  const lines: string[] = [];

  lines.push(`# ${packageName}`);
  lines.push('');
  
  if (description) {
    lines.push(description);
    lines.push('');
  }

  lines.push('## Nodes');
  lines.push('');

  for (const node of nodes) {
    lines.push(`### ${node.name}`);
    lines.push('');
    
    if (node.description) {
      lines.push(node.description);
      lines.push('');
    }

    lines.push(`**ID:** \`${node.id}\``);
    lines.push('');
    lines.push(`**Category:** ${node.category}`);
    lines.push('');

    if (node.inputs.length > 0) {
      lines.push('**Inputs:**');
      for (const input of node.inputs) {
        const name = typeof input === 'string' ? input : input.name;
        lines.push(`- \`${name}\``);
      }
      lines.push('');
    }

    if (node.outputs.length > 0) {
      lines.push('**Outputs:**');
      for (const output of node.outputs) {
        const name = typeof output === 'string' ? output : output.name;
        lines.push(`- \`${name}\``);
      }
      lines.push('');
    }

    if (node.properties.length > 0) {
      lines.push('**Properties:**');
      lines.push('');
      lines.push('| Name | Type | Required | Description |');
      lines.push('|------|------|----------|-------------|');
      for (const prop of node.properties) {
        const required = prop.required ? 'Yes' : 'No';
        const desc = prop.description || '';
        lines.push(`| \`${prop.name}\` | ${prop.type} | ${required} | ${desc} |`);
      }
      lines.push('');
    }
  }

  lines.push('## Installation');
  lines.push('');
  lines.push('```bash');
  lines.push(`npm install ${packageName}`);
  lines.push('# or');
  lines.push(`yarn add ${packageName}`);
  lines.push('```');
  lines.push('');

  lines.push('## Usage');
  lines.push('');
  lines.push('```typescript');
  lines.push(`import { nodes } from '${packageName}';`);
  lines.push(`import { NodeRegistry } from '@xrules/sdk';`);
  lines.push('');
  lines.push('// Register all nodes');
  lines.push('nodes.forEach(node => NodeRegistry.register(node));');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

export default {
  generateNodeFile,
  generatePackageIndex,
  generateTestFile,
  generateReadme,
  CodeGenOptions,
};
