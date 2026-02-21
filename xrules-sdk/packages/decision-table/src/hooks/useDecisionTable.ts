import { useState, useCallback, useMemo } from 'react';
import { DecisionTable, HitPolicy, generateId } from '@xrules/core';
import { evaluateDecisionTable, validateDecisionTable } from '../utils/evaluator';
import { addRule, removeRule, moveRule } from '../utils/converter';
import { EvaluationContext, EvaluationResult, ValidationResult } from '../types';

export interface UseDecisionTableOptions {
  initialTable?: DecisionTable;
  onChange?: (table: DecisionTable) => void;
  validateOnChange?: boolean;
}

export interface UseDecisionTableReturn {
  table: DecisionTable;
  updateTable: (updates: Partial<DecisionTable>) => void;
  
  // Rule operations
  addRule: () => void;
  removeRule: (ruleId: string) => void;
  moveRule: (ruleId: string, newIndex: number) => void;
  updateRule: (ruleId: string, updates: { description?: string }) => void;
  
  // Column operations
  addInput: (name: string, label: string, type?: string) => void;
  addOutput: (name: string, label: string, type?: string) => void;
  removeInput: (inputId: string) => void;
  removeOutput: (outputId: string) => void;
  
  // Hit policy
  setHitPolicy: (policy: HitPolicy) => void;
  
  // Evaluation
  evaluate: (context: EvaluationContext) => EvaluationResult;
  
  // Validation
  validationErrors: string[];
  validate: () => string[];
  
  // Table info
  isValid: boolean;
  ruleCount: number;
  inputCount: number;
  outputCount: number;
}

export function useDecisionTable(
  options: UseDecisionTableOptions = {}
): UseDecisionTableReturn {
  const { initialTable, onChange, validateOnChange = true } = options;

  const defaultTable: DecisionTable = useMemo(
    () => ({
      id: generateId(),
      name: 'New Decision Table',
      type: 'table',
      version: 1,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: '',
      hitPolicy: 'unique',
      inputs: [],
      outputs: [],
      rules: [],
    }),
    []
  );

  const [table, setTable] = useState<DecisionTable>(initialTable || defaultTable);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const updateTableState = useCallback(
    (updater: (prev: DecisionTable) => DecisionTable) => {
      setTable((prev) => {
        const updated = updater(prev);
        if (validateOnChange) {
          const errors = validateDecisionTable(updated);
          setValidationErrors(errors);
        }
        onChange?.(updated);
        return updated;
      });
    },
    [onChange, validateOnChange]
  );

  const updateTable = useCallback(
    (updates: Partial<DecisionTable>) => {
      updateTableState((prev) => ({
        ...prev,
        ...updates,
        updatedAt: new Date(),
      }));
    },
    [updateTableState]
  );

  const addRule = useCallback(() => {
    updateTableState((prev) => addRule(prev));
  }, [updateTableState]);

  const removeRuleCallback = useCallback(
    (ruleId: string) => {
      updateTableState((prev) => removeRule(prev, ruleId));
    },
    [updateTableState]
  );

  const moveRuleCallback = useCallback(
    (ruleId: string, newIndex: number) => {
      updateTableState((prev) => moveRule(prev, ruleId, newIndex));
    },
    [updateTableState]
  );

  const updateRule = useCallback(
    (ruleId: string, updates: { description?: string }) => {
      updateTableState((prev) => {
        const rules = prev.rules.map((rule) =>
          rule.id === ruleId ? { ...rule, ...updates } : rule
        );
        return { ...prev, rules };
      });
    },
    [updateTableState]
  );

  const addInput = useCallback(
    (name: string, label: string, type: string = 'string') => {
      updateTableState((prev) => ({
        ...prev,
        inputs: [
          ...prev.inputs,
          {
            id: generateId(),
            name,
            label,
            type: type as any,
            expression: name,
          },
        ],
      }));
    },
    [updateTableState]
  );

  const addOutput = useCallback(
    (name: string, label: string, type: string = 'string') => {
      updateTableState((prev) => ({
        ...prev,
        outputs: [
          ...prev.outputs,
          {
            id: generateId(),
            name,
            label,
            type: type as any,
          },
        ],
      }));
    },
    [updateTableState]
  );

  const removeInput = useCallback(
    (inputId: string) => {
      updateTableState((prev) => ({
        ...prev,
        inputs: prev.inputs.filter((i) => i.id !== inputId),
        rules: prev.rules.map((rule) => ({
          ...rule,
          inputEntries: rule.inputEntries.filter((e) => e.inputId !== inputId),
        })),
      }));
    },
    [updateTableState]
  );

  const removeOutput = useCallback(
    (outputId: string) => {
      updateTableState((prev) => ({
        ...prev,
        outputs: prev.outputs.filter((o) => o.id !== outputId),
        rules: prev.rules.map((rule) => ({
          ...rule,
          outputEntries: rule.outputEntries.filter((e) => e.outputId !== outputId),
        })),
      }));
    },
    [updateTableState]
  );

  const setHitPolicy = useCallback(
    (policy: HitPolicy) => {
      updateTableState((prev) => ({ ...prev, hitPolicy: policy }));
    },
    [updateTableState]
  );

  const evaluate = useCallback(
    (context: EvaluationContext) => {
      return evaluateDecisionTable(table, context);
    },
    [table]
  );

  const validate = useCallback(() => {
    const errors = validateDecisionTable(table);
    setValidationErrors(errors);
    return errors;
  }, [table]);

  const isValid = useMemo(() => validationErrors.length === 0, [validationErrors]);

  const ruleCount = table.rules.length;
  const inputCount = table.inputs.length;
  const outputCount = table.outputs.length;

  return {
    table,
    updateTable,
    addRule,
    removeRule: removeRuleCallback,
    moveRule: moveRuleCallback,
    updateRule,
    addInput,
    addOutput,
    removeInput,
    removeOutput,
    setHitPolicy,
    evaluate,
    validationErrors,
    validate,
    isValid,
    ruleCount,
    inputCount,
    outputCount,
  };
}
