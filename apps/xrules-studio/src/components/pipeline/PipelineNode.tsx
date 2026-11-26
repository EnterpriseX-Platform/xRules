'use client';
// A step card in Robot Factory's flow editor look (packages/flow-editor/css/editor.css): 168 px card, radius 10,
// a 36 px tile coloured by the step's group, caption · title · one line under; a green tick once a test run passed it.
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Lock, Check } from 'lucide-react';
import { metaFor, STEP_BY_KIND } from './registry';

const port = '!w-3 !h-3 !bg-[#FBFCFC] !border-0 !rounded-full !shadow-[inset_0_0_0_2px_#3B4752]';

type Tone = { tile: string; ink: string; card?: string };
const START: Tone = { tile: '#16202A', ink: '#FFFFFF' };
const END: Tone = { tile: 'transparent', ink: '#56636D', card: '#E7ECEA' };
const DO: Tone = { tile: 'rgba(34, 184, 201, .14)', ink: '#0E7C89' };
const DECIDE: Tone = { tile: '#DCE7FF', ink: '#2B5BD7' };
const LOGIC: Tone = { tile: '#E7ECEA', ink: '#16202A' };
const TONE: Record<string, Tone> = {
  input: START, apiInput: START, apiinput: START, trigger: START,
  output: END, findings: END, apiResponse: END, apiresponse: END, end: END,
  ruleCall: DECIDE, rulecall: DECIDE, callDecisionFlow: DECIDE, calldecisionflow: DECIDE,
  enrich: DO, lookup: DO, http: DO, filecheck: DO, source: DO, join: DO, write: DO, quality: DO, map: DO, filter: DO, notify: DO,
  items: { tile: '#EEF1F6', ink: '#3B4656' }, screen: { tile: '#E3F5E8', ink: '#198038' }, score: { tile: '#EEF1FF', ink: '#2B3A8F' },
  rank: { tile: '#F1E8FF', ink: '#8A3FFC' }, pick: { tile: '#E5EFFF', ink: '#0F62FE' },
};

export function PipelineNode({ type, data, selected }: NodeProps) {
  const d: any = data || {};
  const m = metaFor(type);
  const Icon = m.icon;
  const tone = TONE[type] || LOGIC;
  const sub = d.subtitle ?? m.sub?.(d);
  const failed = d.__status === 'error';
  const ran = d.__status === 'ok';
  const ring = failed ? 'inset 0 0 0 2px #E4452E' : selected ? 'inset 0 0 0 2px #16202A, 0 2px 4px rgb(0 0 0 / .1), 0 10px 22px rgb(0 0 0 / .08)' : 'inset 0 0 0 1px #AEB8B6, 0 1px 2px rgb(0 0 0 / .06), 0 4px 12px rgb(0 0 0 / .04)';
  return (
    <div className="relative grid items-center gap-[10px] w-[168px] min-h-[70px] py-[10px] pl-[10px] pr-3 rounded-[10px] text-left"
      style={{ gridTemplateColumns: '36px minmax(0, 1fr)', background: tone.card || '#FBFCFC', color: '#16202A', boxShadow: ring, fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <Handle type="target" position={Position.Left} id="l" className={port} />
      <Handle type="target" position={Position.Top} id="t" className={port} />
      <span className="grid place-items-center w-9 h-9 rounded-[9px]" style={{ background: tone.tile, color: tone.ink, boxShadow: tone === END ? 'inset 0 0 0 1.5px #AEB8B6' : undefined }}>
        <Icon className="h-5 w-5" strokeWidth={1.7} />
      </span>
      <span className="grid gap-px min-w-0">
        <small className="text-[11.5px] leading-[15px] font-semibold uppercase tracking-[.02em] text-[#56636D]">{m.label}</small>
        <b className="text-[14.5px] leading-[19px] font-semibold truncate">{d.label || m.title}</b>
        {d.__out ? <span className="text-[12.5px] leading-4 truncate tabular-nums text-[#2E9A5B]">{d.__out}</span> : sub && <span className="text-[12.5px] leading-4 truncate text-[#56636D]">{sub}</span>}
      </span>
      {ran && <span className="absolute -top-2 -left-2 grid place-items-center w-[18px] h-[18px] rounded-full bg-[#2E9A5B] text-white shadow-[0_0_0_2px_#FBFCFC]"><Check className="h-3 w-3" strokeWidth={2.6} /></span>}
      {failed && <span className="absolute -top-2 -left-2 w-[18px] h-[18px] rounded-full bg-[#E4452E] shadow-[0_0_0_2px_#FBFCFC]" />}
      {m.locked && (
        <span className="absolute -top-2 -right-2 grid place-items-center w-5 h-5 rounded-full bg-[#FBFCFC] text-[#3B4752] shadow-[inset_0_0_0_1.5px_#AEB8B6,0_0_0_2px_#FBFCFC]" title="Cannot be removed">
          <Lock className="h-3 w-3" strokeWidth={2.2} />
        </span>
      )}
      {type === 'branch' ? (
        <>
          <Handle type="source" position={Position.Right} id="true" style={{ top: '35%' }} className={port} />
          <Handle type="source" position={Position.Right} id="false" style={{ top: '70%' }} className={port} />
        </>
      ) : (
        <Handle type="source" position={Position.Right} id="r" className={port} />
      )}
      <Handle type="source" position={Position.Bottom} id="b" className={port} />
    </div>
  );
}

// every known step kind (plus legacy kinds) renders with the same card
const LEGACY = ['assign', 'switch', 'declare', 'globals', 'foreach', 'sticky', 'end', 'dynamicRule', 'aiAgent', 'append', 'collect', 'debug', 'customCode', 'dbQuery', 'dbQuerySingle', 'rulecall', 'fanout'];
export const pipelineNodeTypes: Record<string, typeof PipelineNode> = Object.fromEntries([...Object.keys(STEP_BY_KIND), ...LEGACY].map(k => [k, PipelineNode]));
