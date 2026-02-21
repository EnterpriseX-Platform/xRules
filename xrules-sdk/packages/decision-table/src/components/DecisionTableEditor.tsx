import React, { useState } from 'react';
import { DecisionTable as DecisionTableType } from '@xrules/core';
import { DecisionTableEditorProps } from '../types';
import { useDecisionTable } from '../hooks/useDecisionTable';
import { DecisionTable } from './DecisionTable';
import { HitPolicySelector } from './HitPolicySelector';

export const DecisionTableEditor: React.FC<DecisionTableEditorProps> = ({
  table: initialTable,
  onChange,
  onSave,
  onValidate,
  readOnly = false,
  height = 500,
  className = '',
}) => {
  const {
    table,
    updateTable,
    addRule,
    removeRule,
    addInput,
    addOutput,
    setHitPolicy,
    validationErrors,
    isValid,
    ruleCount,
    inputCount,
    outputCount,
  } = useDecisionTable({
    initialTable,
    onChange,
    validateOnChange: true,
  });

  const [newInputName, setNewInputName] = useState('');
  const [newInputLabel, setNewInputLabel] = useState('');
  const [newOutputName, setNewOutputName] = useState('');
  const [newOutputLabel, setNewOutputLabel] = useState('');

  const handleSave = () => {
    onSave?.(table);
  };

  const handleValidate = () => {
    const customErrors = onValidate?.(table) || [];
    return customErrors;
  };

  return (
    <div className={`decision-table-editor ${className}`}>
      {/* Header */}
      <div className="editor-header">
        <input
          type="text"
          value={table.name}
          onChange={(e) => updateTable({ name: e.target.value })}
          className="table-name-input"
          placeholder="Decision Table Name"
          disabled={readOnly}
        />
        
        <HitPolicySelector
          value={table.hitPolicy}
          onChange={setHitPolicy}
          disabled={readOnly}
        />

        <div className="editor-actions">
          {!readOnly && (
            <>
              <button onClick={handleValidate} className="btn-validate">
                Validate
              </button>
              <button onClick={handleSave} className="btn-save" disabled={!isValid}>
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Description */}
      <textarea
        value={table.description || ''}
        onChange={(e) => updateTable({ description: e.target.value })}
        className="table-description"
        placeholder="Description (optional)"
        disabled={readOnly}
        rows={2}
      />

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h4>Validation Errors:</h4>
          <ul>
            {validationErrors.map((error, index) => (
              <li key={index} className="error-item">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Column Management */}
      {!readOnly && (
        <div className="column-management">
          <div className="add-column-section">
            <h4>Add Input Column</h4>
            <input
              type="text"
              placeholder="Variable Name"
              value={newInputName}
              onChange={(e) => setNewInputName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Display Label"
              value={newInputLabel}
              onChange={(e) => setNewInputLabel(e.target.value)}
            />
            <button
              onClick={() => {
                if (newInputName && newInputLabel) {
                  addInput(newInputName, newInputLabel);
                  setNewInputName('');
                  setNewInputLabel('');
                }
              }}
              disabled={!newInputName || !newInputLabel}
            >
              Add Input
            </button>
          </div>

          <div className="add-column-section">
            <h4>Add Output Column</h4>
            <input
              type="text"
              placeholder="Variable Name"
              value={newOutputName}
              onChange={(e) => setNewOutputName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Display Label"
              value={newOutputLabel}
              onChange={(e) => setNewOutputLabel(e.target.value)}
            />
            <button
              onClick={() => {
                if (newOutputName && newOutputLabel) {
                  addOutput(newOutputName, newOutputLabel);
                  setNewOutputName('');
                  setNewOutputLabel('');
                }
              }}
              disabled={!newOutputName || !newOutputLabel}
            >
              Add Output
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="table-stats">
        <span>Inputs: {inputCount}</span>
        <span>Outputs: {outputCount}</span>
        <span>Rules: {ruleCount}</span>
      </div>

      {/* Table */}
      <div className="table-container">
        <DecisionTable
          table={table}
          onChange={onChange}
          readOnly={readOnly}
          height={height}
        />
      </div>

      {/* Actions */}
      {!readOnly && (
        <div className="table-actions">
          <button onClick={addRule} className="btn-add-rule">
            + Add Rule
          </button>
        </div>
      )}
    </div>
  );
};

export default DecisionTableEditor;
