import { DecisionTable, DecisionRule, HitPolicy } from '@xrules/core';
import { EvaluationContext, EvaluationResult, MatchedRule, TraceStep } from '../types';

export function evaluateDecisionTable(
  table: DecisionTable,
  context: EvaluationContext
): EvaluationResult {
  const startTime = performance.now();
  const matchedRules: MatchedRule[] = [];
  const trace: TraceStep[] = [];

  for (const rule of table.rules) {
    const stepStart = performance.now();
    let matched = true;

    // Evaluate all input entries for this rule
    for (const entry of rule.inputEntries) {
      const input = table.inputs.find((i) => i.id === entry.inputId);
      if (!input) continue;

      const variableValue = context.variables[input.name];
      const entryValue = entry.value;

      if (entryValue !== '-' && !matchesCondition(variableValue, entryValue)) {
        matched = false;
        break;
      }
    }

    const stepDuration = performance.now() - stepStart;

    trace.push({
      rowNumber: rule.rowNumber,
      condition: rule.inputEntries.map((e) => e.value).join(', '),
      evaluated: true,
      matched,
      duration: stepDuration,
    });

    if (matched) {
      const outputs: Record<string, unknown> = {};
      for (const entry of rule.outputEntries) {
        const output = table.outputs.find((o) => o.id === entry.outputId);
        if (output) {
          outputs[output.name] = evaluateOutput(entry.value, context);
        }
      }

      matchedRules.push({
        ruleId: rule.id,
        rowNumber: rule.rowNumber,
        outputs,
      });

      // Handle hit policy
      if (table.hitPolicy === 'first') {
        break;
      }
    }
  }

  const totalDuration = performance.now() - startTime;

  // Apply hit policy to determine final output
  const finalOutput = applyHitPolicy(table.hitPolicy, matchedRules);

  return {
    matched: matchedRules.length > 0,
    rules: matchedRules,
    outputs: finalOutput,
    trace: {
      steps: trace,
      duration: totalDuration,
    },
  };
}

function matchesCondition(variableValue: unknown, condition: string): boolean {
  // Handle FEEL-like expressions
  // Simple value comparison
  if (condition.startsWith('"') && condition.endsWith('"')) {
    const strValue = condition.slice(1, -1);
    return variableValue === strValue;
  }

  // Numeric comparison
  if (!isNaN(Number(condition))) {
    return variableValue === Number(condition);
  }

  // Boolean
  if (condition === 'true') return variableValue === true;
  if (condition === 'false') return variableValue === false;

  // Range expressions: [1..10], (1..10], etc.
  const rangeMatch = condition.match(/^(\[|\()(.+)\.\.(.+)(\]|\))$/);
  if (rangeMatch) {
    const [, leftBracket, min, max, rightBracket] = rangeMatch;
    const numValue = Number(variableValue);
    const minVal = Number(min);
    const maxVal = Number(max);

    const leftInclusive = leftBracket === '[';
    const rightInclusive = rightBracket === ']';

    const leftMatch = leftInclusive ? numValue >= minVal : numValue > minVal;
    const rightMatch = rightInclusive ? numValue <= maxVal : numValue < maxVal;

    return leftMatch && rightMatch;
  }

  // Comparison operators
  if (condition.startsWith('<=')) {
    return Number(variableValue) <= Number(condition.slice(2));
  }
  if (condition.startsWith('>=')) {
    return Number(variableValue) >= Number(condition.slice(2));
  }
  if (condition.startsWith('<')) {
    return Number(variableValue) < Number(condition.slice(1));
  }
  if (condition.startsWith('>')) {
    return Number(variableValue) > Number(condition.slice(1));
  }
  if (condition.startsWith('!=')) {
    return variableValue !== condition.slice(2);
  }

  // List membership
  if (condition.includes(',')) {
    const values = condition.split(',').map((v) => v.trim());
    return values.includes(String(variableValue));
  }

  // Default: equality check
  return String(variableValue) === condition;
}

function evaluateOutput(value: string, context: EvaluationContext): unknown {
  // Check if value is a variable reference
  if (value.startsWith('${') && value.endsWith('}')) {
    const varName = value.slice(2, -1);
    return context.variables[varName];
  }

  // Check if value is a string literal
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  // Try parsing as number
  if (!isNaN(Number(value))) {
    return Number(value);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Return as-is for other expressions
  return value;
}

function applyHitPolicy(
  hitPolicy: HitPolicy,
  matchedRules: MatchedRule[]
): Record<string, unknown> | undefined {
  if (matchedRules.length === 0) {
    return undefined;
  }

  switch (hitPolicy) {
    case 'first':
    case 'unique':
    case 'any':
      return matchedRules[0].outputs;

    case 'collect':
      // Collect all outputs into arrays
      const collected: Record<string, unknown[]> = {};
      for (const rule of matchedRules) {
        for (const [key, value] of Object.entries(rule.outputs)) {
          if (!collected[key]) {
            collected[key] = [];
          }
          collected[key].push(value);
        }
      }
      return collected;

    case 'priority':
      // Return the rule with highest priority (lowest row number)
      return matchedRules[0].outputs;

    case 'ruleOrder':
      // Return outputs in order of rule evaluation
      return matchedRules[0].outputs;

    default:
      return matchedRules[0].outputs;
  }
}

export function validateDecisionTable(table: DecisionTable): string[] {
  const errors: string[] = [];

  // Check for empty table
  if (table.inputs.length === 0) {
    errors.push('Decision table must have at least one input');
  }

  if (table.outputs.length === 0) {
    errors.push('Decision table must have at least one output');
  }

  if (table.rules.length === 0) {
    errors.push('Decision table must have at least one rule');
  }

  // Check for overlapping rules (for unique hit policy)
  if (table.hitPolicy === 'unique') {
    for (let i = 0; i < table.rules.length; i++) {
      for (let j = i + 1; j < table.rules.length; j++) {
        if (rulesOverlap(table.rules[i], table.rules[j])) {
          errors.push(
            `Rules ${table.rules[i].rowNumber} and ${table.rules[j].rowNumber} overlap (hit policy is unique)`
          );
        }
      }
    }
  }

  // Check for gaps (rules that will never match)
  // This is a simplified check - full gap analysis is complex

  return errors;
}

function rulesOverlap(rule1: DecisionRule, rule2: DecisionRule): boolean {
  // Two rules overlap if all their input entries are compatible
  for (const entry1 of rule1.inputEntries) {
    const entry2 = rule2.inputEntries.find((e) => e.inputId === entry1.inputId);
    if (!entry2) continue;

    if (entry1.value !== '-' && entry2.value !== '-' && entry1.value !== entry2.value) {
      return false;
    }
  }
  return true;
}
