# XRules Studio - Frontend Setup Guide

## 🎉 โครงสร้าง Frontend ที่สร้างแล้ว

```
apps/xrules-studio/
├── package.json              # Dependencies ครบถ้วน
├── next.config.js            # Next.js config
├── tailwind.config.ts        # Design tokens
├── tsconfig.json             # TypeScript config
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Root layout
│   │   ├── globals.css       # Global styles
│   │   ├── login/            # Login page
│   │   ├── signup/           # Signup page
│   │   └── [tenant]/         # Multi-tenant routes
│   │       ├── page.tsx      # Dashboard (redirect to projects)
│   │       ├── projects/
│   │       │   ├── page.tsx  # Projects list
│   │       │   └── [projectId]/
│   │       │       └── rules/
│   │       │           └── page.tsx  # Rules editor
│   │       ├── analytics/
│   │       └── settings/
│   │
│   ├── components/
│   │   ├── Providers.tsx     # React Query + Toast
│   │   ├── layout/
│   │   │   └── ProjectTree.tsx  # Project tree navigation
│   │   ├── ui/               # Base UI components
│   │   ├── rules/            # Rule-specific components
│   │   ├── flows/            # Flow editor components
│   │   ├── variables/        # Variable editor components
│   │   ├── forms/            # Form components
│   │   └── common/           # Shared components
│   │
│   ├── api/
│   │   └── client.ts         # Axios client + API methods
│   │
│   ├── hooks/
│   │   └── useRules.ts       # React Query hooks
│   │
│   ├── stores/
│   │   └── tenantStore.ts    # Zustand store
│   │
│   ├── types/
│   │   └── index.ts          # TypeScript definitions
│   │
│   └── lib/                  # Utilities
│
└── public/                   # Static assets
```

---

## 🚀 เริ่มต้นใช้งาน

### 1. ติดตั้ง Dependencies

```bash
cd apps/xrules-studio
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:50051
```

### 3. รัน Development Server

```bash
npm run dev
# เปิด http://localhost:3000
```

---

## 📁 Key Features ที่สร้างแล้ว

### ✅ Multi-tenant Architecture
- URL: `/{tenant}/projects/{projectId}/rules`
- Tenant context provider (Zustand store)
- Project scoping

### ✅ Type System (Complete)
- All entities: Tenant, Project, Package, Rule, Variable
- Engine types: rules, pmml, ml, llm, ai
- Rule content: DMN, Script, ML, LLM configs
- Execution types

### ✅ API Integration
- Axios client with interceptors
- Auto token refresh
- Tenant header injection
- Type-safe API methods

### ✅ React Query Hooks
```typescript
const { data: rules } = useRules({ projectId });
const { data: rule } = useRule(id);
const createRule = useCreateRule();
const executeRule = useExecuteRule();
```

### ✅ State Management
```typescript
const { currentTenant, currentProject, canEdit } = useTenantStore();
```

### ✅ Project Tree Component
- Collapsible packages
- Rule selection
- Status indicators
- Create actions

---

## 🎨 Design System

### Colors
```css
--brand-500: #3b82f6;      /* Primary Blue */
--engine-rules: #3b82f6;   /* Blue */
--engine-pmml: #8b5cf6;    /* Violet */
--engine-ml: #10b981;      /* Emerald */
--engine-llm: #f59e0b;     /* Amber */
--engine-ai: #ef4444;      /* Red */
--status-draft: #f59e0b;
--status-active: #10b981;
```

### Typography
- Font: Inter (Google Fonts)
- Code: JetBrains Mono

---

## 📍 Routes Structure

| Route | Description |
|-------|-------------|
| `/login` | Login page |
| `/signup` | Signup page |
| `/invite/[token]` | Accept invitation |
| `/{tenant}` | Dashboard (redirect) |
| `/{tenant}/projects` | Projects list |
| `/{tenant}/projects/new` | Create project |
| `/{tenant}/projects/{id}/rules` | Rules editor |
| `/{tenant}/projects/{id}/flows` | Flows editor |
| `/{tenant}/projects/{id}/variables` | Variables |
| `/{tenant}/projects/{id}/settings` | Settings |
| `/{tenant}/analytics` | Analytics |
| `/{tenant}/settings` | Tenant settings |

---

## 🔧 Dependencies ที่สำคัญ

```json
{
  "next": "14.1.0",
  "react": "^18.2.0",
  "@tanstack/react-query": "^5.17.0",
  "zustand": "^4.4.7",
  "tailwindcss": "^3.4.1",
  "lucide-react": "^0.312.0",
  "handsontable": "^14.1.0",
  "reactflow": "^11.10.2",
  "monaco-editor": "^0.45.0"
}
```

---

## 📝 สิ่งที่ต้องทำต่อ (Next Steps)

### High Priority
1. **DMN Table Editor** - Handsontable integration
2. **Rule CRUD API** - Backend integration
3. **Authentication Pages** - Login/Signup forms
4. **Layout Shell** - Sidebar + Header

### Medium Priority
5. **Variable Editor** - Input/output definition
6. **Flow Designer** - React Flow integration
7. **Version History** - Diff viewer
8. **Audit Log** - Activity feed

### Low Priority
9. **Analytics Dashboard** - Charts
10. **Settings Pages** - Configuration
11. **Import/Export** - File handling

---

## 🎯 ตัวอย่างการใช้งาน

### Fetch Rules
```typescript
import { useRules, useCreateRule } from '@/hooks/useRules';

function RulesList() {
  const { data: rules, isLoading } = useRules({ projectId: '1' });
  const createRule = useCreateRule();

  if (isLoading) return <Loading />;

  return (
    <ul>
      {rules?.map(rule => (
        <li key={rule.id}>{rule.name}</li>
      ))}
    </ul>
  );
}
```

### Access Tenant Context
```typescript
import { useTenantStore } from '@/stores/tenantStore';

function RuleActions() {
  const { canEdit, currentTenant } = useTenantStore();

  if (!canEdit) return null;

  return <button>Edit Rule</button>;
}
```

### Execute Rule
```typescript
import { useExecuteRule } from '@/hooks/useRules';

function TestPanel() {
  const execute = useExecuteRule();

  const handleTest = async () => {
    const result = await execute.mutateAsync({
      ruleId: 'rule-1',
      input: { creditScore: 750 }
    });
    console.log(result.output);
  };

  return <button onClick={handleTest}>Test</button>;
}
```

---

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run Storybook
npm run storybook
```

---

## 📚 Documentation

- [UI/UX Design](./design/UI-UX-DESIGN.md) - Design system & user flows
- [Tasks](./TASKS.md) - Development task list
- [Roadmap](./ROADMAP.md) - Overall project roadmap

---

**Ready to start development! 🚀**
