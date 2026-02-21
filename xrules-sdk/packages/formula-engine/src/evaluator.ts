import { ExpressionContext, EvaluationResult, ParseResult, ExpressionNode } from './types';
import { builtInFunctions } from './functions';

export function parse(expression: string): ParseResult {
  try {
    const ast = parseExpression(expression.trim());
    return { success: true, ast };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Parse error',
    };
  }
}

export function evaluate(expression: string, context: ExpressionContext): EvaluationResult {
  const parseResult = parse(expression);
  if (!parseResult.success) {
    return { success: false, error: parseResult.error };
  }

  try {
    const value = evaluateNode(parseResult.ast!, context);
    return {
      success: true,
      value,
      type: typeof value,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Evaluation error',
    };
  }
}

function parseExpression(expr: string): ExpressionNode {
  // Simple recursive descent parser for FEEL expressions
  expr = expr.trim();

  // Handle literals
  if (expr === 'null') return { type: 'literal', value: null, dataType: 'null' };
  if (expr === 'true') return { type: 'literal', value: true, dataType: 'boolean' };
  if (expr === 'false') return { type: 'literal', value: false, dataType: 'boolean' };

  // String literal
  if (expr.startsWith('"') && expr.endsWith('"')) {
    return {
      type: 'literal',
      value: expr.slice(1, -1),
      dataType: 'string',
    };
  }

  // Number literal
  if (!isNaN(Number(expr)) && expr !== '') {
    return {
      type: 'literal',
      value: Number(expr),
      dataType: 'number',
    };
  }

  // List literal
  if (expr.startsWith('[') && expr.endsWith(']')) {
    const items = splitItems(expr.slice(1, -1));
    return {
      type: 'list',
      items: items.map(parseExpression),
    };
  }

  // Context literal
  if (expr.startsWith('{') && expr.endsWith('}')) {
    const entries = parseContextEntries(expr.slice(1, -1));
    return { type: 'context', entries };
  }

  // Function call
  const funcMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\((.*)\)$/);
  if (funcMatch) {
    const [, name, argsStr] = funcMatch;
    const args = argsStr.trim() ? splitItems(argsStr).map(parseExpression) : [];
    return { type: 'functionCall', name, args };
  }

  // Variable
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr)) {
    return { type: 'variable', name: expr };
  }

  // Binary operations
  const operators = ['and', 'or', '=>', '>=', '<=', '!=', '=', '>', '<', '+', '-', '*', '/', '%'];
  for (const op of operators) {
    const index = findOperator(expr, op);
    if (index !== -1) {
      const left = expr.slice(0, index).trim();
      const right = expr.slice(index + op.length).trim();
      return {
        type: 'binaryOp',
        operator: op,
        left: parseExpression(left),
        right: parseExpression(right),
      };
    }
  }

  // Unary operations
  if (expr.startsWith('not ') || expr.startsWith('-')) {
    const operator = expr.startsWith('not ') ? 'not' : '-';
    const operand = expr.slice(operator === 'not' ? 4 : 1).trim();
    return {
      type: 'unaryOp',
      operator,
      operand: parseExpression(operand),
    };
  }

  throw new Error(`Unable to parse expression: ${expr}`);
}

function evaluateNode(node: ExpressionNode, context: ExpressionContext): unknown {
  switch (node.type) {
    case 'literal':
      return node.value;

    case 'variable':
      return getVariable(node.name, context);

    case 'binaryOp':
      return evaluateBinaryOp(node.operator, node.left, node.right, context);

    case 'unaryOp':
      return evaluateUnaryOp(node.operator, node.operand, context);

    case 'functionCall':
      return evaluateFunctionCall(node.name, node.args, context);

    case 'list':
      return node.items.map((item) => evaluateNode(item, context));

    case 'context':
      const result: Record<string, unknown> = {};
      for (const entry of node.entries) {
        result[entry.key] = evaluateNode(entry.value, context);
      }
      return result;

    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

function getVariable(name: string, context: ExpressionContext): unknown {
  const parts = name.split('.');
  let value: unknown = context.variables[parts[0]];

  for (let i = 1; i < parts.length; i++) {
    if (value === null || value === undefined) {
      return null;
    }
    value = (value as Record<string, unknown>)[parts[i]];
  }

  return value ?? null;
}

function evaluateBinaryOp(
  operator: string,
  left: ExpressionNode,
  right: ExpressionNode,
  context: ExpressionContext
): unknown {
  const leftValue = evaluateNode(left, context);
  const rightValue = evaluateNode(right, context);

  switch (operator) {
    case '+':
      return (leftValue as number) + (rightValue as number);
    case '-':
      return (leftValue as number) - (rightValue as number);
    case '*':
      return (leftValue as number) * (rightValue as number);
    case '/':
      return (leftValue as number) / (rightValue as number);
    case '%':
      return (leftValue as number) % (rightValue as number);
    case '=':
      return leftValue === rightValue;
    case '!=':
      return leftValue !== rightValue;
    case '<':
      return (leftValue as number) < (rightValue as number);
    case '>':
      return (leftValue as number) > (rightValue as number);
    case '<=':
      return (leftValue as number) <= (rightValue as number);
    case '>=':
      return (leftValue as number) >= (rightValue as number);
    case 'and':
      return Boolean(leftValue) && Boolean(rightValue);
    case 'or':
      return Boolean(leftValue) || Boolean(rightValue);
    case '=>':
      return !leftValue || Boolean(rightValue);
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

function evaluateUnaryOp(
  operator: string,
  operand: ExpressionNode,
  context: ExpressionContext
): unknown {
  const value = evaluateNode(operand, context);

  switch (operator) {
    case 'not':
      return !value;
    case '-':
      return -(value as number);
    default:
      throw new Error(`Unknown unary operator: ${operator}`);
  }
}

function evaluateFunctionCall(
  name: string,
  args: ExpressionNode[],
  context: ExpressionContext
): unknown {
  const func = builtInFunctions[name] || context.functions?.[name];

  if (!func) {
    throw new Error(`Unknown function: ${name}`);
  }

  const argValues = args.map((arg) => evaluateNode(arg, context));
  return func(...argValues);
}

function splitItems(str: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of str) {
    if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      items.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function parseContextEntries(str: string): Array<{ key: string; value: ExpressionNode }> {
  const entries: Array<{ key: string; value: ExpressionNode }> = [];
  const items = splitItems(str);

  for (const item of items) {
    const colonIndex = item.indexOf(':');
    if (colonIndex === -1) continue;

    const key = item.slice(0, colonIndex).trim();
    const value = item.slice(colonIndex + 1).trim();

    entries.push({
      key: key.replace(/"/g, ''),
      value: parseExpression(value),
    });
  }

  return entries;
}

function findOperator(expr: string, operator: string): number {
  let depth = 0;
  for (let i = 0; i <= expr.length - operator.length; i++) {
    const char = expr[i];
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (depth === 0 && expr.slice(i, i + operator.length) === operator) {
      // Check for word boundaries for word operators
      if (/^[a-z]+$/.test(operator)) {
        const before = i === 0 || /\s/.test(expr[i - 1]);
        const after =
          i + operator.length >= expr.length || /\s/.test(expr[i + operator.length]);
        if (before && after) return i;
      } else {
        return i;
      }
    }
  }
  return -1;
}
