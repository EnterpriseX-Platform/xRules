import React, { useMemo, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, CellValueChangedEvent, GridReadyEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import { DecisionTable as DecisionTableType } from '@xrules/core';
import { DecisionTableProps, RowData, ColumnDef } from '../types';
import { convertToAgGridColumns, convertToRowData, convertFromRowData } from '../utils/converter';

export const DecisionTable: React.FC<DecisionTableProps> = ({
  table,
  onChange,
  readOnly = false,
  height = 400,
  className = '',
}) => {
  // Convert decision table to ag-grid format
  const { columnDefs, rowData } = useMemo(() => {
    const columns = convertToAgGridColumns(table);
    const rows = convertToRowData(table);
    return { columnDefs: columns, rowData: rows };
  }, [table]);

  // Handle cell value changes
  const onCellValueChanged = useCallback(
    (event: CellValueChangedEvent) => {
      if (!onChange || readOnly) return;

      const updatedRowData = [...event.api.getRenderedNodes().map(node => node.data as RowData)];
      const updatedTable = convertFromRowData(table, updatedRowData);
      onChange(updatedTable);
    },
    [onChange, readOnly, table]
  );

  // Default column definitions
  const defaultColDef: ColDef = useMemo(
    () => ({
      editable: !readOnly,
      resizable: true,
      sortable: true,
      filter: true,
      flex: 1,
      minWidth: 100,
    }),
    [readOnly]
  );

  // Grid options
  const gridOptions = useMemo(
    () => ({
      domLayout: 'autoHeight' as const,
      animateRows: true,
      rowDragManaged: !readOnly,
      suppressMoveWhenRowDragging: false,
      rowDragMultiRow: true,
      rowSelection: 'multiple' as const,
      suppressRowClickSelection: true,
      undoRedoCellEditing: !readOnly,
      undoRedoCellEditingLimit: 20,
    }),
    [readOnly]
  );

  const onGridReady = useCallback((params: GridReadyEvent) => {
    params.api.sizeColumnsToFit();
  }, []);

  return (
    <div
      className={`ag-theme-alpine ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
    >
      <AgGridReact
        columnDefs={columnDefs}
        rowData={rowData}
        defaultColDef={defaultColDef}
        onCellValueChanged={onCellValueChanged}
        onGridReady={onGridReady}
        {...gridOptions}
      />
    </div>
  );
};

export default DecisionTable;
