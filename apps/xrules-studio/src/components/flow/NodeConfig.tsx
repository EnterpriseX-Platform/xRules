'use client';

import { Node } from 'reactflow';
import { nodeLabel } from './nodeTypes';
import { useQuery } from '@tanstack/react-query';
import { rulesApi } from '@/lib/api';

export function NodeConfig({
  node, projectId, onChange, onDelete,
}: {
  node: Node | null;
  projectId: string;
  onChange: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}) {
  if (!node) {
    return (
      <div className="p-4 text-xs text-subtle font-mono">
        Select a node to configure it.
      </div>
    );
  }

  const set = (patch: any) => onChange(node.id, { ...node.data, ...patch });
  const data = node.data || {};

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="label-section mb-1.5">Node</div>
        <div className="font-mono text-xs text-text">{nodeLabel(node.type || '')}</div>
        <div className="font-mono text-[10px] text-subtle">id: {node.id}</div>
      </div>

      <Field label="Label">
        <input className="input w-full" value={data.label || ''} onChange={(e) => set({ label: e.target.value })} />
      </Field>

      {node.type === 'input' && (
        <p className="text-[11px] font-mono text-subtle">
          The Input node receives the request payload. Output of this node = entire <code>input</code>.
        </p>
      )}

      {node.type === 'output' && (
        <p className="text-[11px] font-mono text-subtle">
          The Output node returns whatever flows into it as the API response.
        </p>
      )}

      {node.type === 'http' && (
        <>
          <Field label="Method">
            <select className="input w-full" value={data.method || 'GET'} onChange={(e) => set({ method: e.target.value })}>
              <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
            </select>
          </Field>
          <Field label="URL">
            <input className="input w-full font-mono text-xs" placeholder="https://api.example.com/users/{{input.userId}}" value={data.url || ''} onChange={(e) => set({ url: e.target.value })} />
          </Field>
          <Field label="Headers (JSON)">
            <textarea className="input w-full h-20 py-2 font-mono text-xs" placeholder='{"Authorization":"Bearer ..."}' value={data.headersJson || ''} onChange={(e) => set({ headersJson: e.target.value })} />
          </Field>
          <Field label="Body (JSON, for POST/PUT)">
            <textarea className="input w-full h-20 py-2 font-mono text-xs" placeholder='{"foo":"bar"}' value={data.bodyJson || ''} onChange={(e) => set({ bodyJson: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === 'dbQuery' && (
        <>
          <Field label="Connection ID">
            <input className="input w-full font-mono text-xs" value={data.connectionId || ''} onChange={(e) => set({ connectionId: e.target.value })} />
          </Field>
          <Field label="SQL">
            <textarea className="input w-full h-24 py-2 font-mono text-xs" placeholder="SELECT * FROM users WHERE id = $1" value={data.sql || ''} onChange={(e) => set({ sql: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === 'transform' && (
        <>
          <Field label="Language">
            <select className="input w-full" value={data.language || 'jsonata'} onChange={(e) => set({ language: e.target.value })}>
              <option value="jsonata">JSONata</option>
              <option value="jsonpath">JSONPath</option>
            </select>
          </Field>
          <Field label="Expression">
            <textarea className="input w-full h-32 py-2 font-mono text-xs" placeholder='{"score": input.amount * 0.1}' value={data.expression || ''} onChange={(e) => set({ expression: e.target.value })} />
          </Field>
        </>
      )}

      {node.type === 'ruleCall' && <RuleCallEditor projectId={projectId} data={data} set={set} />}

      {node.type === 'branch' && (
        <>
          <Field label="Condition (JSONata or expression)">
            <textarea className="input w-full h-20 py-2 font-mono text-xs" placeholder="input.amount > 1000" value={data.condition || ''} onChange={(e) => set({ condition: e.target.value })} />
          </Field>
          <p className="text-[10px] font-mono text-subtle">
            Two outgoing handles: <span className="text-ok">true</span> (top) / <span className="text-danger">false</span> (bottom).
          </p>
        </>
      )}

      <div className="pt-4 border-t border-border">
        <button className="btn-ghost text-danger text-xs" onClick={() => onDelete(node.id)}>
          Remove node
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label-section mb-1.5">{label}</div>
      {children}
    </div>
  );
}

function RuleCallEditor({ projectId, data, set }: { projectId: string; data: any; set: (p: any) => void }) {
  const { data: rules = [] } = useQuery({
    queryKey: ['rules', projectId, 'all-for-flow'],
    queryFn: () => rulesApi.list(projectId),
  });
  return (
    <Field label="Rule">
      <select
        className="input w-full"
        value={data.ruleId || ''}
        onChange={(e) => {
          const rule = rules.find((r: any) => r.id === e.target.value);
          set({ ruleId: e.target.value, ruleSlug: rule?.slug, ruleName: rule?.name });
        }}
      >
        <option value="">— select a rule —</option>
        {rules.map((r: any) => (
          <option key={r.id} value={r.id}>{r.name} ({r.slug})</option>
        ))}
      </select>
    </Field>
  );
}
