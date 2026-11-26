// One name for each kind of decision, used on every screen.
export const KIND_NAME: Record<string, string> = {
  DECISION_TABLE: 'Decision table', DECISION_TREE: 'Decision tree', FORMULA: 'Calculation', SCORECARD: 'Scorecard',
  SCRIPT: 'Script', LOOKUP: 'Lookup', MODEL_CALL: 'Model call', AI_AGENT: 'AI agent', FLOW: 'Strategy', RULE_FLOW: 'Rule flow',
};
export const kindName = (t?: string) => KIND_NAME[String(t || '').toUpperCase()] || String(t || '').replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
