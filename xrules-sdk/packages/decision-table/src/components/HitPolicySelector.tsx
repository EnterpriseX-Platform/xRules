import React from 'react';
import { HitPolicy } from '@xrules/core';
import { HitPolicyOption } from '../types';

const hitPolicyOptions: HitPolicyOption[] = [
  {
    value: 'unique',
    label: 'Unique',
    description: 'Only one rule can match. Error if multiple match.',
  },
  {
    value: 'first',
    label: 'First',
    description: 'First matching rule is used. Rules are evaluated in order.',
  },
  {
    value: 'collect',
    label: 'Collect',
    description: 'All matching rules are used. Output is a list.',
  },
  {
    value: 'ruleOrder',
    label: 'Rule Order',
    description: 'All matching rules are used. Output is ordered by rule priority.',
  },
  {
    value: 'any',
    label: 'Any',
    description: 'Any matching rule can be used. All matching rules must have same output.',
  },
  {
    value: 'priority',
    label: 'Priority',
    description: 'Matching rule with highest output priority is used.',
  },
];

export interface HitPolicySelectorProps {
  value: HitPolicy;
  onChange: (policy: HitPolicy) => void;
  disabled?: boolean;
  className?: string;
}

export const HitPolicySelector: React.FC<HitPolicySelectorProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
}) => {
  const selectedOption = hitPolicyOptions.find((o) => o.value === value);

  return (
    <div className={`hit-policy-selector ${className}`}>
      <label className="hit-policy-label">Hit Policy</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as HitPolicy)}
        disabled={disabled}
        className="hit-policy-select"
      >
        {hitPolicyOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {selectedOption && (
        <span className="hit-policy-description">{selectedOption.description}</span>
      )}
    </div>
  );
};

export default HitPolicySelector;
