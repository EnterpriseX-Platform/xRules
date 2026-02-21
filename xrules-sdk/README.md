# XRules SDK

Complete SDK for building decision management applications.

## Packages

| Package | Description |
|---------|-------------|
| `@xrules/core` | Core types and utilities |
| `@xrules/decision-table` | Excel-like decision table editor |
| `@xrules/decision-tree` | Visual decision tree editor |
| `@xrules/formula-engine` | FEEL expression parser & evaluator |
| `@xrules/ai-assistant` | AI-powered rule generation |
| `@xrules/testing` | Testing framework |
| `@xrules/deployment` | Deployment manager |
| `@xrules/analytics` | Analytics & reporting |
| `@xrules/integration` | Integration connectors |

## Installation

```bash
npm install @xrules/core @xrules/decision-table
```

## Usage

```typescript
import { DecisionTableEditor } from '@xrules/decision-table';

function App() {
  return (
    <DecisionTableEditor
      table={myTable}
      onChange={handleChange}
      onSave={handleSave}
    />
  );
}
```

## Documentation

See individual package READMEs for detailed documentation.
