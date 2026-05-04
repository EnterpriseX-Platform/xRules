'use client';
// Scorecard designer.
// Definition shape:
// {
//   attributes: [{ name, bands: [{ match: { eq?|lt?|lte?|gt?|gte?|btw?:[lo,hi]|in?:[...] }, points }] }],
//   thresholds: [{ score, decision }]
// }
// Engine equivalent in apps/xrules-backend/src/services/execute.service.ts::runScorecard.
import { useMemo, useState } from 'react';
import { Plus, Trash2, BarChart3, Play } from 'lucide-react';

type Op = 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'btw' | 'in';
interface Band {
  op: Op;
  value: string;     // for eq/lt/lte/gt/gte
  lo?: string;       // for btw
  hi?: string;       // for btw
  values?: string;   // comma-separated for `in`
  points: number;
}
interface Attr { name: string; bands: Band[] }
interface Threshold { score: number; decision: string }

function bandToMatch(b: Band): any {
  switch (b.op) {
    case 'eq':  return { eq:  parseLooseValue(b.value) };
    case 'lt':  return { lt:  Number(b.value) };
    case 'lte': return { lte: Number(b.value) };
    case 'gt':  return { gt:  Number(b.value) };
    case 'gte': return { gte: Number(b.value) };
    case 'btw': return { btw: [Number(b.lo), Number(b.hi)] };
    case 'in':  return { in:  (b.values || '').split(',').map(s => parseLooseValue(s.trim())) };
  }
}
function matchToBand(m: any): Pick<Band, 'op' | 'value' | 'lo' | 'hi' | 'values'> {
  if (!m) return { op: 'eq', value: '' };
  if ('eq'  in m) return { op: 'eq',  value: String(m.eq) };
  if ('lt'  in m) return { op: 'lt',  value: String(m.lt) };
  if ('lte' in m) return { op: 'lte', value: String(m.lte) };
  if ('gt'  in m) return { op: 'gt',  value: String(m.gt) };
  if ('gte' in m) return { op: 'gte', value: String(m.gte) };
  if ('btw' in m && Array.isArray(m.btw)) return { op: 'btw', value: '', lo: String(m.btw[0]), hi: String(m.btw[1]) };
  if ('in'  in m && Array.isArray(m.in))  return { op: 'in',  value: '', values: m.in.map((x: any) => String(x)).join(',') };
  return { op: 'eq', value: '' };
}
function parseLooseValue(v: string): any {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}
function decodeAttr(a: any): Attr {
  return {
    name: a.name || '',
    bands: (a.bands || []).map((b: any) => ({ ...matchToBand(b.match), points: Number(b.points) || 0 })),
  };
}
function encodeAttr(a: Attr): any {
  return { name: a.name, bands: a.bands.map(b => ({ match: bandToMatch(b), points: b.points })) };
}

// Local copy of runScorecard logic for the live preview
function previewScore(def: { attributes: Attr[]; thresholds: Threshold[] }, input: any): { score: number; decision: any } {
  let score = 0;
  for (const attr of def.attributes) {
    const v = input[attr.name];
    for (const band of attr.bands) {
      if (matchBand(v, bandToMatch(band))) { score += Number(band.points || 0); break; }
    }
  }
  const sorted = [...def.thresholds].sort((a, b) => Number(b.score) - Number(a.score));
  let decision: any = null;
  for (const t of sorted) if (score >= Number(t.score)) { decision = parseLooseValue(t.decision); break; }
  return { score, decision };
}
function matchBand(value: any, m: any): boolean {
  if (!m) return false;
  if ('eq'  in m) return value === m.eq;
  if ('lt'  in m) return Number(value) <  Number(m.lt);
  if ('lte' in m) return Number(value) <= Number(m.lte);
  if ('gt'  in m) return Number(value) >  Number(m.gt);
  if ('gte' in m) return Number(value) >= Number(m.gte);
  if ('btw' in m && Array.isArray(m.btw)) {
    const [lo, hi] = m.btw; return Number(value) >= Number(lo) && Number(value) <= Number(hi);
  }
  if ('in'  in m && Array.isArray(m.in))  return m.in.includes(value);
  return false;
}

export function ScorecardDesigner({
  definition, onChange,
}: {
  definition: any;
  onChange: (next: any) => void;
}) {
  const [attributes, setAttributes] = useState<Attr[]>(
    Array.isArray(definition?.attributes) ? definition.attributes.map(decodeAttr) : [],
  );
  const [thresholds, setThresholds] = useState<Threshold[]>(
    Array.isArray(definition?.thresholds)
      ? definition.thresholds.map((t: any) => ({ score: Number(t.score) || 0, decision: typeof t.decision === 'string' ? t.decision : JSON.stringify(t.decision) }))
      : [],
  );
  const [testInput, setTestInput] = useState<string>('{\n  \n}');

  function emit(patch: { attributes?: Attr[]; thresholds?: Threshold[] } = {}) {
    const next = {
      attributes: (patch.attributes ?? attributes).map(encodeAttr),
      thresholds: (patch.thresholds ?? thresholds).map(t => ({
        score: Number(t.score) || 0,
        decision: parseLooseValue(t.decision),
      })),
    };
    onChange(next);
  }

  function addAttribute() {
    const a: Attr = { name: `attr${attributes.length + 1}`, bands: [{ op: 'eq', value: '', points: 0 }] };
    const next = [...attributes, a];
    setAttributes(next); emit({ attributes: next });
  }
  function patchAttr(idx: number, p: Partial<Attr>) {
    const next = attributes.map((a, i) => i === idx ? { ...a, ...p } : a);
    setAttributes(next); emit({ attributes: next });
  }
  function removeAttr(idx: number) {
    const next = attributes.filter((_, i) => i !== idx);
    setAttributes(next); emit({ attributes: next });
  }

  function addBand(attrIdx: number) {
    const a = attributes[attrIdx];
    const next = attributes.map((x, i) => i === attrIdx
      ? { ...x, bands: [...x.bands, { op: 'eq' as Op, value: '', points: 0 }] }
      : x);
    setAttributes(next); emit({ attributes: next });
  }
  function patchBand(attrIdx: number, bandIdx: number, p: Partial<Band>) {
    const next = attributes.map((x, i) => i === attrIdx
      ? { ...x, bands: x.bands.map((b, j) => j === bandIdx ? { ...b, ...p } : b) }
      : x);
    setAttributes(next); emit({ attributes: next });
  }
  function removeBand(attrIdx: number, bandIdx: number) {
    const next = attributes.map((x, i) => i === attrIdx
      ? { ...x, bands: x.bands.filter((_, j) => j !== bandIdx) }
      : x);
    setAttributes(next); emit({ attributes: next });
  }

  function addThreshold() {
    const next = [...thresholds, { score: 0, decision: '"approve"' }];
    setThresholds(next); emit({ thresholds: next });
  }
  function patchThreshold(idx: number, p: Partial<Threshold>) {
    const next = thresholds.map((t, i) => i === idx ? { ...t, ...p } : t);
    setThresholds(next); emit({ thresholds: next });
  }
  function removeThreshold(idx: number) {
    const next = thresholds.filter((_, i) => i !== idx);
    setThresholds(next); emit({ thresholds: next });
  }

  // Max possible: sum of max points per attribute
  const maxScore = useMemo(() =>
    attributes.reduce((acc, a) => acc + (a.bands.length ? Math.max(...a.bands.map(b => b.points || 0)) : 0), 0),
    [attributes],
  );

  // Live preview
  const preview = useMemo(() => {
    let parsed: any = {};
    try { parsed = JSON.parse(testInput); } catch { return null; }
    return previewScore({ attributes, thresholds }, parsed);
  }, [attributes, thresholds, testInput]);

  return (
    <div className="grid grid-cols-[1fr_300px] gap-3">
      <div className="space-y-3">
        {/* ATTRIBUTES */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-accent" />
              <span className="label-section">Attributes</span>
              <span className="font-mono text-[10px] text-subtle">{attributes.length}</span>
            </div>
            <button className="btn-ghost text-xs" onClick={addAttribute}><Plus className="h-3 w-3" /> Attribute</button>
          </div>

          <div className="space-y-2">
            {attributes.length === 0 && (
              <div className="py-8 text-center text-subtle text-xs">
                No attributes — add one to start scoring inputs.
              </div>
            )}
            {attributes.map((a, ai) => (
              <div key={ai} className="border border-border rounded">
                <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/20">
                  <input
                    className="input h-7 text-xs flex-1"
                    placeholder="attribute name (input field)"
                    value={a.name}
                    onChange={(e) => patchAttr(ai, { name: e.target.value })}
                  />
                  <span className="font-mono text-[10px] text-subtle">
                    max {a.bands.length ? Math.max(...a.bands.map(b => b.points || 0)) : 0} pts
                  </span>
                  <button className="btn-ghost p-1 text-danger" onClick={() => removeAttr(ai)}>
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="p-2 space-y-1">
                  {a.bands.map((b, bi) => (
                    <BandRow
                      key={bi}
                      band={b}
                      onChange={(p) => patchBand(ai, bi, p)}
                      onRemove={() => removeBand(ai, bi)}
                    />
                  ))}
                  <button className="btn-ghost text-[11px] text-subtle hover:text-text" onClick={() => addBand(ai)}>
                    <Plus className="h-3 w-3" /> Band
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* THRESHOLDS */}
        <div className="card p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="label-section">Thresholds (score → decision)</span>
              <span className="font-mono text-[10px] text-subtle">{thresholds.length}</span>
            </div>
            <button className="btn-ghost text-xs" onClick={addThreshold}><Plus className="h-3 w-3" /> Threshold</button>
          </div>

          <table className="w-full font-mono text-xs">
            <thead className="bg-muted/30">
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left w-24 text-subtle">If score ≥</th>
                <th className="px-2 py-1.5 text-left text-subtle">Then decision</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {thresholds.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-subtle">
                  No thresholds — total score will return as `decision: null`
                </td></tr>
              )}
              {thresholds
                .map((t, originalIdx) => ({ t, originalIdx }))
                .sort((a, b) => Number(b.t.score) - Number(a.t.score))
                .map(({ t, originalIdx }) => (
                  <tr key={originalIdx} className="border-b border-border/40">
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        className="bg-transparent border-0 outline-none w-full text-xs tabular-nums"
                        value={t.score}
                        onChange={(e) => patchThreshold(originalIdx, { score: Number(e.target.value) })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        className="bg-transparent border-0 outline-none w-full text-xs"
                        placeholder='"approve" or {"action":"queue"}'
                        value={t.decision}
                        onChange={(e) => patchThreshold(originalIdx, { decision: e.target.value })}
                      />
                    </td>
                    <td>
                      <button className="btn-ghost p-1 text-danger" onClick={() => removeThreshold(originalIdx)}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT — LIVE TEST */}
      <div className="space-y-3">
        <div className="card p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="label-section flex items-center gap-1.5"><Play className="h-3 w-3" /> Live Test</span>
            <span className="font-mono text-[10px] text-subtle">max {maxScore}</span>
          </div>
          <textarea
            className="input w-full font-mono text-xs h-40"
            placeholder='{"income": 50000, "age": 35}'
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Stat label="score">
              {preview === null ? '–' : (
                <span className="font-mono text-lg tabular-nums">{preview.score}</span>
              )}
            </Stat>
            <Stat label="decision">
              <span className="font-mono text-xs break-words">
                {preview === null ? 'invalid json' : (preview.decision === null ? 'null' : JSON.stringify(preview.decision))}
              </span>
            </Stat>
          </div>
        </div>

        <div className="card p-3">
          <div className="label-section mb-2">How it works</div>
          <ul className="text-[11px] text-subtle space-y-1.5 leading-snug">
            <li>1. For each attribute, evaluate input field against bands top→bottom.</li>
            <li>2. First matching band's points are added to total.</li>
            <li>3. Highest threshold whose score ≤ total wins.</li>
            <li>4. If no threshold matches, decision is null.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function BandRow({ band, onChange, onRemove }: {
  band: Band; onChange: (p: Partial<Band>) => void; onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 font-mono text-xs">
      <select
        className="input h-7 text-xs w-16"
        value={band.op}
        onChange={(e) => onChange({ op: e.target.value as Op })}
      >
        <option value="eq">=</option>
        <option value="lt">&lt;</option>
        <option value="lte">≤</option>
        <option value="gt">&gt;</option>
        <option value="gte">≥</option>
        <option value="btw">between</option>
        <option value="in">in</option>
      </select>
      {band.op === 'btw' ? (
        <>
          <input
            className="input h-7 text-xs w-20" placeholder="lo"
            value={band.lo || ''} onChange={(e) => onChange({ lo: e.target.value })}
          />
          <span className="text-subtle">…</span>
          <input
            className="input h-7 text-xs w-20" placeholder="hi"
            value={band.hi || ''} onChange={(e) => onChange({ hi: e.target.value })}
          />
        </>
      ) : band.op === 'in' ? (
        <input
          className="input h-7 text-xs flex-1" placeholder="a, b, c"
          value={band.values || ''} onChange={(e) => onChange({ values: e.target.value })}
        />
      ) : (
        <input
          className="input h-7 text-xs flex-1" placeholder="value"
          value={band.value} onChange={(e) => onChange({ value: e.target.value })}
        />
      )}
      <span className="text-subtle">→</span>
      <input
        type="number"
        className="input h-7 text-xs w-16 tabular-nums" placeholder="pts"
        value={band.points} onChange={(e) => onChange({ points: Number(e.target.value) })}
      />
      <button className="btn-ghost p-1 text-danger opacity-50 hover:opacity-100" onClick={onRemove}>
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded p-2">
      <div className="label-section text-[9px]">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
