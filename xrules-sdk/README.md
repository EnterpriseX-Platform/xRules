# @xrules/sdk

Custom Node Development SDK for the xrules-v2 platform. Build custom nodes for the flow designer with TypeScript.

## Features

- 🚀 **Simple API** - Define nodes with a clean, intuitive interface
- 🔧 **Full TypeScript Support** - Type-safe development experience
- 🎨 **Custom UI Components** - Build property panels with ease
- 🧪 **Local Testing** - Test nodes before publishing
- 📦 **CLI Tools** - Scaffold, build, and publish nodes
- 🔌 **Extensible** - Hook into the execution engine

## Installation

```bash
npm install @xrules/sdk
# or
yarn add @xrules/sdk
```

## Quick Start

### 1. Create a New Node

```bash
npx xrules-sdk init my-custom-node
cd my-custom-node
```

### 2. Define Your Node

```typescript
import { defineNode } from '@xrules/sdk';

export const SlackNotificationNode = defineNode({
  id: 'slack-notification',
  name: 'Slack Notification',
  category: 'notifications',
  icon: 'MessageSquare',
  inputs: ['data'],
  outputs: ['response', 'error'],
  properties: [
    {
      name: 'webhookUrl',
      type: 'string',
      label: 'Webhook URL',
      required: true,
      secret: true
    },
    {
      name: 'message',
      type: 'string',
      label: 'Message Template',
      multiline: true
    },
    {
      name: 'channel',
      type: 'string',
      label: 'Channel',
      default: '#general'
    }
  ],
  async execute(context, inputs) {
    const { webhookUrl, message, channel } = context.properties;
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, channel })
      });
      
      return {
        response: await response.json(),
        error: null
      };
    } catch (error) {
      return {
        response: null,
        error: { message: error.message }
      };
    }
  }
});
```

### 3. Build and Test

```bash
# Build the node
npx xrules-sdk build

# Test locally
npx xrules-sdk test

# Publish to registry
npx xrules-sdk publish
```

## Node Configuration

### Basic Structure

```typescript
interface NodeConfig {
  id: string;              // Unique identifier
  name: string;            // Display name
  category: string;        // Category for organization
  icon?: string;           // Lucide icon name
  description?: string;    // Node description
  inputs: string[];        // Input port names
  outputs: string[];       // Output port names
  properties: PropertyConfig[];
  execute: ExecuteFunction;
}
```

### Property Types

| Type | Description | Options |
|------|-------------|---------|
| `string` | Text input | `multiline`, `secret` |
| `number` | Numeric input | `min`, `max`, `step` |
| `boolean` | Checkbox | - |
| `select` | Dropdown | `options` |
| `json` | JSON editor | `schema` |
| `code` | Code editor | `language` |
| `connection` | Connection reference | `connectionType` |

### Property Configuration Examples

```typescript
// String property
{ name: 'apiKey', type: 'string', label: 'API Key', secret: true }

// Number property
{ name: 'timeout', type: 'number', label: 'Timeout (ms)', default: 5000, min: 1000 }

// Select property
{ 
  name: 'method', 
  type: 'select', 
  label: 'HTTP Method',
  options: ['GET', 'POST', 'PUT', 'DELETE'],
  default: 'GET'
}

// JSON property
{ 
  name: 'headers', 
  type: 'json', 
  label: 'Headers',
  default: { 'Content-Type': 'application/json' }
}

// Code property
{ 
  name: 'transform', 
  type: 'code', 
  label: 'Transform Function',
  language: 'javascript'
}

// Connection property
{ 
  name: 'database', 
  type: 'connection', 
  label: 'Database Connection',
  connectionType: 'database'
}
```

## Execution Context

The `execute` function receives a context object:

```typescript
interface NodeContext {
  // Node properties (configured values)
  properties: Record<string, any>;
  
  // Flow-wide variables
  variables: Record<string, any>;
  
  // Logger instance
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  
  // HTTP client
  http: AxiosInstance;
  
  // Secrets manager
  secrets: {
    get: (key: string) => Promise<string>;
    set: (key: string, value: string) => Promise<void>;
  };
  
  // Execution metadata
  execution: {
    id: string;
    flowId: string;
    startedAt: Date;
  };
}
```

## CLI Commands

### `init <name>`

Initialize a new node project from template.

```bash
npx xrules-sdk init my-node
npx xrules-sdk init my-node --template typescript
npx xrules-sdk init my-node --template javascript
```

### `build`

Build the node package for distribution.

```bash
npx xrules-sdk build
npx xrules-sdk build --watch
```

### `test`

Test the node locally with sample inputs.

```bash
npx xrules-sdk test
npx xrules-sdk test --input '{"data": "test"}'
npx xrules-sdk test --file test-input.json
```

### `publish`

Publish the node to the registry.

```bash
npx xrules-sdk publish
npx xrules-sdk publish --registry https://custom.registry.com
npx xrules-sdk publish --tag beta
```

## Advanced Topics

### Custom Validation

```typescript
import { defineNode, z } from '@xrules/sdk';

const configSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().startsWith('#'),
  retryCount: z.number().min(0).max(5).optional()
});

defineNode({
  id: 'validated-node',
  // ... other config
  validate: (config) => {
    const result = configSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Validation failed: ${result.error.message}`);
    }
  }
});
```

### Dynamic Ports

```typescript
defineNode({
  id: 'dynamic-router',
  name: 'Dynamic Router',
  inputs: ['data'],
  outputs: [], // Will be defined dynamically
  properties: [
    { name: 'routes', type: 'json', label: 'Routes' }
  ],
  getDynamicOutputs: (config) => {
    const routes = config.routes || [];
    return routes.map((route: any) => route.name);
  },
  execute: async (context, inputs) => {
    const { routes } = context.properties;
    const { data } = inputs;
    
    // Find matching route
    const route = routes.find((r: any) => r.condition(data));
    
    return {
      [route.name]: data
    };
  }
});
```

### Custom UI Components

```typescript
import { defineNode, PropertyPanel } from '@xrules/sdk';

defineNode({
  id: 'custom-ui-node',
  // ... config
  renderPropertyPanel: (props) => {
    return (
      <PropertyPanel>
        <PropertyPanel.TextField name="title" label="Title" />
        <PropertyPanel.CodeEditor 
          name="script" 
          label="Custom Script"
          language="javascript"
        />
        <PropertyPanel.Custom>
          <MyCustomComponent />
        </PropertyPanel.Custom>
      </PropertyPanel>
    );
  }
});
```

## Examples

### REST API Node

See `examples/custom-api-node/` for a complete REST API integration node.

### Data Transform Node

See `examples/custom-transform-node/` for a data transformation node with custom code execution.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT © XRULES Team
