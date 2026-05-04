# XRules Studio - UI/UX Design Document

> **Version:** 1.0  
> **Platform:** Web Application (SaaS)  
> **Target Users:** Business Analysts, Data Scientists, Developers

---

## 🎨 Design System Overview

### Visual Identity

```
Brand Colors:
├── Primary:    #3B82F6 (Blue-500)    - Actions, buttons, links
├── Secondary:  #8B5CF6 (Violet-500)  - Secondary actions, accents
├── Success:    #10B981 (Emerald-500)  - Success states, active rules
├── Warning:    #F59E0B (Amber-500)   - Warnings, draft states
├── Danger:     #EF4444 (Red-500)     - Errors, delete actions
├── Info:       #06B6D4 (Cyan-500)    - Info states, tips
└── Neutral:    #64748B (Slate-500)   - Text, borders
```

### Typography

```
Font Family: Inter (Google Fonts)
├── Heading 1: 32px/40px, font-weight: 700
├── Heading 2: 24px/32px, font-weight: 600
├── Heading 3: 20px/28px, font-weight: 600
├── Heading 4: 16px/24px, font-weight: 600
├── Body:      14px/20px, font-weight: 400
├── Small:     12px/16px, font-weight: 400
└── Code:      13px/20px, font-family: JetBrains Mono
```

---

## 📐 Layout Architecture

### URL Structure (Multi-tenant SaaS)

```
/{tenant}                      # Tenant home / Dashboard
  ├── /projects                # Project list
  │     └── /new               # Create new project
  ├── /projects/{projectId}    # Project workspace
  │     ├── /rules             # Rule list (default view)
 │     ├── /flows             # Rule flows
  │     ├── /variables         # Variable definitions
  │     └── /settings          # Project settings
  ├── /rules/{ruleId}          # Direct rule access
  ├── /variables               # Global variables
  ├── /analytics               # Analytics dashboard
  └── /settings                # Tenant settings

/public                        # Public pages (no tenant)
  ├── /login
  ├── /signup
  └── /invite/{token}
```

### Page Layouts

#### 1. Dashboard Layout (Shell)

```
┌─────────────────────────────────────────────────────────────┐
│  Header (64px)                                               │
│  ┌─────────┐  Search...    🔔 👤 Tenant ▼  User ▼          │
│  │  Logo   │                                                │
└──┴─────────┴────────────────────────────────────────────────┘
┌──────────┬──────────────────────────────────────────────────┐
│ Sidebar  │  Main Content Area                               │
│ (240px)  │  ┌────────────────────────────────────────────┐  │
│          │  │ Breadcrumbs > Page Title              [+New]│  │
│  🏠 Home │  ├────────────────────────────────────────────┤  │
│  📁 Proj │  │                                            │  │
│  📊 Anal │  │  Content                                   │  │
│  ⚙️ Sett │  │                                            │  │
│          │  │                                            │  │
│ ─────────│  │                                            │  │
│ Engines  │  │                                            │  │
│  ⚙️ Rule │  │                                            │  │
│  📊 PMML │  │                                            │  │
│  🤖 ML   │  │                                            │  │
│  💬 LLM  │  │                                            │  │
│  🧠 AI   │  │                                            │  │
└──────────┴──┴────────────────────────────────────────────┘  │
```

#### 2. Rule Editor Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Rule Editor: loan-eligibility-check          [Save] [Test] │
├──────────┬────────────────────────────────────────┬─────────┤
│ Project  │  Rule Content                          │ Right   │
│ Tree     │  ┌──────────────────────────────────┐  │ Panel   │
│          │  │ Tab: Table | JSON | Settings     │  │ (280px) │
│ 📦 Pack  │  ├──────────────────────────────────┤  │         │
│  📄 Rule1│  │                                  │  │ ┌─────┐ │
│  📄 Rule2│  │  [DMN Table Grid]                │  │ │Props│ │
│ 📦 Other │  │                                  │  │ ├─────┤ │
│          │  │  +----+--------+--------+----+   │  │ │Input│ │
│          │  │  | ## | Credit | Income |... |   │  │ │     │ │
│          │  │  +----+--------+--------+----+   │  │ │ Out │ │
│          │  │  | 1  | >= 700 | >= 80k |... |   │  │ └─────┘ │
│          │  │  | 2  | >= 650 | >= 60k |... |   │  │         │
│          │  │  +----+--------+--------+----+   │  │ ┌─────┐ │
│          │  │                                  │  │ │Test │ │
│          │  │                                  │  │ │Panel│ │
│          │  └──────────────────────────────────┘  │ └─────┘ │
└──────────┴────────────────────────────────────────┴─────────┘
```

#### 3. Flow Editor Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Flow Editor: customer-onboarding-flow    [Run] [Save]      │
├──────────┬────────────────────────────────────────┬─────────┤
│ Node     │  Canvas (React Flow)                   │ Config  │
│ Palette  │                                        │ Panel   │
│          │    ┌─────┐      ┌─────┐      ┌─────┐  │         │
│  🟢 Start│───▶│Start│─────▶│Check│─────▶│Email│  │ Selected│
│  📋 Rule │    │     │      │Age  │      │     │  │ Node:   │
│  🔷 Gate │    └─────┘      └──┬──┘      └─────┘  │ CheckAge│
│  🔄 Loop │                    │                   │         │
│  🔚 End  │                 ┌──┴──┐               │ Cond:   │
│          │                 │< 18 │               │ age >=18│
│          │                 └─────┘               │         │
└──────────┴────────────────────────────────────────┴─────────┘
```

---

## 🧩 Component Specifications

### 1. Project Tree (Sidebar)

```typescript
interface ProjectTreeProps {
  projectId: string;
  selectedRuleId?: string;
  onSelectRule: (ruleId: string) => void;
  onCreateRule: (packageId: string) => void;
  onCreatePackage: (parentId?: string) => void;
}

// Features:
// - Drag & drop rules between packages
// - Context menu (right-click)
// - Expand/collapse state persistence
// - Search filter
// - Badges: count, status icons
```

**Visual:**
```
📁 customer-evaluation (12)
├── 📦 onboarding (3)
│   ├── 📄 check-eligibility ✓
│   ├── 📄 calculate-score ⚠️
│   └── 📄 assign-tier ✓
├── 📦 risk-assessment (5)
│   ├── 📄 fraud-check ✓
│   └── ...
└── 📄 global-variables
```

### 2. DMN Table Editor

```typescript
interface DmnTableProps {
  ruleId: string;
  definition: DmnDefinition;
  onChange: (definition: DmnDefinition) => void;
  onExecute: (input: unknown) => Promise<ExecutionResult>;
  readOnly?: boolean;
}

interface DmnDefinition {
  hitPolicy: 'FIRST' | 'UNIQUE' | 'COLLECT' | 'ANY' | 'RULE_ORDER';
  inputs: DmnInput[];
  outputs: DmnOutput[];
  rules: DmnRule[];
}
```

**Cell Types:**
| Type | Input | Example |
|------|-------|---------|
| String | Text input | `"active"` |
| Number | Number input | `100`, `> 50` |
| Boolean | Checkbox | `true`, `false` |
| Comparison | Operator + Value | `>= 700` |
| Range | Min-Max inputs | `[18, 65]` |
| Wildcard | `-` (dash) | Matches any |

### 3. Variable Editor

```typescript
interface VariableEditorProps {
  variables: Variable[];
  onChange: (variables: Variable[]) => void;
  scope: 'global' | 'project' | 'rule';
}

interface Variable {
  id: string;
  name: string;
  displayName: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  description?: string;
  defaultValue?: unknown;
  validation?: ValidationRule[];
  required: boolean;
}
```

**Visual:**
```
┌─────────────────────────────────────────────────────────┐
│ Input Variables                                    [+Add]│
├─────────────┬──────────┬──────────┬─────────────────────┤
│ Name        │ Type     │ Required │ Default    │ Actions│
├─────────────┼──────────┼──────────┼────────────┼────────┤
│ creditScore │ number   │ ✓        │ -          │ ✏️ 🗑️  │
│ income      │ number   │ ✓        │ 0          │ ✏️ 🗑️  │
│ customerType│ string   │ -        │ "regular"  │ ✏️ 🗑️  │
└─────────────┴──────────┴──────────┴────────────┴────────┘
```

### 4. Version Timeline

```typescript
interface VersionTimelineProps {
  ruleId: string;
  versions: RuleVersion[];
  currentVersion: number;
  onRestore: (version: number) => void;
  onCompare: (v1: number, v2: number) => void;
}

interface RuleVersion {
  version: number;
  author: User;
  message: string;
  timestamp: Date;
  changeStats: { added: number; modified: number; deleted: number };
}
```

**Visual:**
```
● v1.5  Active
│  John D. - 2 hours ago
│  "Fix credit score threshold"
│  +2 ~5 -1
│
○ v1.4
│  Jane S. - 1 day ago
│  "Add income validation"
│
○ v1.3
   Mike T. - 3 days ago
   "Initial rule setup"
```

---

## 🎭 User Flows

### Flow 1: Create New Rule (Decision Table)

```
1. User clicks [+ New Rule] button
   ↓
2. Modal: Choose rule type
   ├── Decision Table (DMN)
   ├── Script (JavaScript/Python)
   ├── ML Model
   └── LLM Prompt
   ↓
3. User selects "Decision Table"
   ↓
4. Modal: Rule configuration
   ├── Name: loan-eligibility
   ├── Package: risk-assessment
   ├── Description (optional)
   └── Hit Policy: FIRST (default)
   ↓
5. Editor opens with empty table
   ↓
6. User defines columns
   ├── Add Input: creditScore (number)
   ├── Add Input: annualIncome (number)
   └── Add Output: decision (string)
   ↓
7. User fills rules (rows)
   ├── Row 1: >= 700, >= 80000, "approved"
   ├── Row 2: >= 650, >= 60000, "approved"
   └── Row 3: < 600, -, "declined"
   ↓
8. User clicks [Test] button
   ↓
9. Test panel opens
   ├── Input: { creditScore: 750, income: 90000 }
   ├── Execute
   └── Output: { decision: "approved", interestRate: 3.5 }
   ↓
10. User clicks [Save]
    ├── Version 1 created
    └── Status: draft
    ↓
11. User clicks [Publish]
    └── Status: draft → active
```

---

## 🎨 Design Tokens (Tailwind Config)

```javascript
// tailwind.config.ts
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        engine: {
          rules: '#3b82f6',  // Blue
          pmml: '#8b5cf6',   // Violet
          ml: '#10b981',     // Emerald
          llm: '#f59e0b',    // Amber
          ai: '#ef4444',     // Red
        },
        status: {
          draft: '#f59e0b',
          active: '#10b981',
          deprecated: '#64748b',
          archived: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

---

**Next:** See `COMPONENTS.md` for detailed component API specifications
