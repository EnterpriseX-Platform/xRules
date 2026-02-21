import { ColDef, ValueGetterParams, ValueSetterParams } from 'ag-grid-community';
import { DecisionTable, DecisionRule, InputEntry, OutputEntry } from '@xrules/core';
import { RowData } from '../types';

export function convertToAgGridColumns(table: DecisionTable): ColDef[] {
  const columns: ColDef[] = [
    {
      field: 'rowNumber',
      headerName: '#',
      width: 60,
      editable: false,
      sortable: false,
      filter: false,
      pinned: 'left',
      cellClass: 'row-number-cell',
    },
  ];

  // Input columns
  table.inputs.forEach((input) => {
    columns.push({
      field: `input_${input.id}`,
      headerName: input.label,
      headerClass: 'input-column-header',
      cellClass: 'input-cell',
      valueGetter: (params: ValueGetterParams) => {
        const rule = table.rules[params.node.rowIndex!];
        if (!rule) return '';
        const entry = rule.inputEntries.find((e) => e.inputId === input.id);
        return entry?.value || '';
      },
      valueSetter: (params: ValueSetterParams) => {
        const rule = table.rules[params.node.rowIndex!];
        if (!rule) return false;
        const entry = rule.inputEntries.find((e) => e.inputId === input.id);
        if (entry) {
          entry.value = params.newValue;
        } else {
          rule.inputEntries.push({
            inputId: input.id,
            value: params.newValue,
          });
        }
        return true;
      },
    });
  });

  // Output columns
  table.outputs.forEach((output) => {
    columns.push({
      field: `output_${output.id}`,
      headerName: output.label,
      headerClass: 'output-column-header',
      cellClass: 'output-cell',
      valueGetter: (params: ValueGetterParams) => {
        const rule = table.rules[params.node.rowIndex!];
        if (!rule) return '';
        const entry = rule.outputEntries.find((e) => e.outputId === output.id);
        return entry?.value || '';
      },
      valueSetter: (params: ValueSetterParams) => {
        const rule = table.rules[params.node.rowIndex!];
        if (!rule) return false;
        const entry = rule.outputEntries.find((e) => e.outputId === output.id);
        if (entry) {
          entry.value = params.newValue;
        } else {
          rule.outputEntries.push({
            outputId: output.id,
            value: params.newValue,
          });
        }
        return true;
      },
    });
  });

  // Description column
  columns.push({
    field: 'description',
    headerName: 'Description',
    flex: 2,
    minWidth: 150,
    valueGetter: (params: ValueGetterParams) => {
      const rule = table.rules[params.node.rowIndex!];
      return rule?.description || '';
    },
    valueSetter: (params: ValueSetterParams) => {
      const rule = table.rules[params.node.rowIndex!];
      if (rule) {
        rule.description = params.newValue;
        return true;
      }
      return false;
    },
  });

  return columns;
}

export function convertToRowData(table: DecisionTable): RowData[] {
  return table.rules.map((rule, index) => ({
    id: rule.id,
    rowNumber: index + 1,
    description: rule.description || '',
  }));
}

export function convertFromRowData(
  table: DecisionTable,
  rowData: RowData[]
): DecisionTable {
  // Update row numbers based on order
  rowData.forEach((row, index) => {
    const rule = table.rules.find((r) => r.id === row.id);
    if (rule) {
      rule.rowNumber = index + 1;
      rule.description = row.description;
    }
  });

  // Sort rules by row number
  table.rules.sort((a, b) => a.rowNumber - b.rowNumber);

  return { ...table };
}

export function addRule(table: DecisionTable): DecisionTable {
  const newRule: DecisionRule = {
    id: `rule_${Date.now()}`,
    rowNumber: table.rules.length + 1,
    description: '',
    inputEntries: table.inputs.map((input) => ({
      inputId: input.id,
      value: '-',
    })),
    outputEntries: table.outputs.map((output) => ({
      outputId: output.id,
      value: '',
    })),
  };

  return {
    ...table,
    rules: [...table.rules, newRule],
  };
}

export function removeRule(table: DecisionTable, ruleId: string): DecisionTable {
  const updatedRules = table.rules.filter((r) => r.id !== ruleId);
  // Re-number remaining rules
  updatedRules.forEach((rule, index) => {
    rule.rowNumber = index + 1;
  });

  return {
    ...table,
    rules: updatedRules,
  };
}

export function moveRule(
  table: DecisionTable,
  ruleId: string,
  newIndex: number
): DecisionTable {
  const rules = [...table.rules];
  const currentIndex = rules.findIndex((r) => r.id === ruleId);

  if (currentIndex === -1) return table;

  const [movedRule] = rules.splice(currentIndex, 1);
  rules.splice(newIndex, 0, movedRule);

  // Re-number all rules
  rules.forEach((rule, index) => {
    rule.rowNumber = index + 1;
  });

  return {
    ...table,
    rules,
  };
}
