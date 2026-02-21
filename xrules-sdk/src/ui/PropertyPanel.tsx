/**
 * PropertyPanel
 * Property panel builder components for node configuration UI
 */

import React from 'react';
import {
  PropertyConfig,
  PropertyPanelProps,
  StringPropertyConfig,
  NumberPropertyConfig,
  BooleanPropertyConfig,
  SelectPropertyConfig,
  MultiSelectPropertyConfig,
  JsonPropertyConfig,
  CodePropertyConfig,
  ConnectionPropertyConfig,
  DatePropertyConfig,
  FilePropertyConfig,
  SecretPropertyConfig,
} from '../types/node';

/**
 * Base property field props
 */
interface BaseFieldProps {
  name: string;
  label: string;
  description?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
}

/**
 * Text field component
 */
interface TextFieldProps extends BaseFieldProps {
  value?: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'url';
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export const TextField: React.FC<TextFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  multiline,
  placeholder,
  type = 'text',
  minLength,
  maxLength,
}) => {
  const inputClasses = `
    w-full px-3 py-2 border rounded-md text-sm
    ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}
    ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
    focus:outline-none focus:ring-2
  `;

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      {multiline ? (
        <textarea
          className={`${inputClasses} min-h-[100px] resize-y`}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          minLength={minLength}
          maxLength={maxLength}
        />
      ) : (
        <input
          type={type}
          className={inputClasses}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          minLength={minLength}
          maxLength={maxLength}
        />
      )}
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Number field component
 */
interface NumberFieldProps extends BaseFieldProps {
  value?: number;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
}) => {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <input
        type="number"
        className={`
          w-full px-3 py-2 border rounded-md text-sm
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100' : 'bg-white'}
        `}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
        placeholder={placeholder}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
      />
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Checkbox field component
 */
interface CheckboxFieldProps extends BaseFieldProps {
  checked?: boolean;
  onChange: (checked: boolean) => void;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  label,
  description,
  disabled,
  checked,
  onChange,
}) => {
  return (
    <div className="mb-4">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          checked={checked || false}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {description && (
            <p className="text-xs text-gray-500">{description}</p>
          )}
        </div>
      </label>
    </div>
  );
};

/**
 * Select field component
 */
interface SelectFieldProps extends BaseFieldProps {
  value?: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }> | string[];
  allowCustom?: boolean;
  placeholder?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  options,
  allowCustom,
  placeholder,
}) => {
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <select
        className={`
          w-full px-3 py-2 border rounded-md text-sm
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100' : 'bg-white'}
        `}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {placeholder && (
          <option value="">{placeholder}</option>
        )}
        {normalizedOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Multi-select field component
 */
interface MultiSelectFieldProps extends BaseFieldProps {
  value?: string[];
  onChange: (value: string[]) => void;
  options: Array<{ label: string; value: string }> | string[];
}

export const MultiSelectField: React.FC<MultiSelectFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value = [],
  onChange,
  options,
}) => {
  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  const toggleOption = (optValue: string) => {
    if (value.includes(optValue)) {
      onChange(value.filter((v) => v !== optValue));
    } else {
      onChange([...value, optValue]);
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className={`border rounded-md p-2 ${error ? 'border-red-500' : 'border-gray-300'}`}>
        <div className="space-y-2 max-h-40 overflow-y-auto">
          {normalizedOptions.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                checked={value.includes(opt.value)}
                onChange={() => toggleOption(opt.value)}
                disabled={disabled}
              />
              <span className="text-sm text-gray-700">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * JSON field component
 */
interface JsonFieldProps extends BaseFieldProps {
  value?: any;
  onChange: (value: any) => void;
  schema?: object;
}

export const JsonField: React.FC<JsonFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
}) => {
  const [text, setText] = React.useState(() =>
    value ? JSON.stringify(value, null, 2) : ''
  );
  const [parseError, setParseError] = React.useState<string | null>(null);

  const handleChange = (newText: string) => {
    setText(newText);
    try {
      if (newText.trim()) {
        const parsed = JSON.parse(newText);
        onChange(parsed);
        setParseError(null);
      } else {
        onChange(undefined);
        setParseError(null);
      }
    } catch (e) {
      setParseError('Invalid JSON');
    }
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <textarea
        className={`
          w-full px-3 py-2 border rounded-md text-sm font-mono
          ${error || parseError ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100' : 'bg-white'}
          min-h-[120px] resize-y
        `}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        placeholder="{}"
      />
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {(error || parseError) && (
        <p className="mt-1 text-xs text-red-600">{error || parseError}</p>
      )}
    </div>
  );
};

/**
 * Code field component
 */
interface CodeFieldProps extends BaseFieldProps {
  value?: string;
  onChange: (value: string) => void;
  language?: string;
}

export const CodeField: React.FC<CodeFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  language = 'javascript',
}) => {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
        <span className="ml-2 text-xs text-gray-400">({language})</span>
      </label>
      
      <textarea
        className={`
          w-full px-3 py-2 border rounded-md text-sm font-mono
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100' : 'bg-white'}
          min-h-[150px] resize-y
        `}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        spellCheck={false}
      />
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Connection field component
 */
interface ConnectionFieldProps extends BaseFieldProps {
  value?: string;
  onChange: (value: string) => void;
  connectionType?: string;
  connections?: Array<{ id: string; name: string; type: string }>;
}

export const ConnectionField: React.FC<ConnectionFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  connectionType,
  connections = [],
}) => {
  const filteredConnections = connectionType
    ? connections.filter((c) => c.type === connectionType)
    : connections;

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <select
        className={`
          w-full px-3 py-2 border rounded-md text-sm
          ${error ? 'border-red-500' : 'border-gray-300'}
          ${disabled ? 'bg-gray-100' : 'bg-white'}
        `}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">Select connection...</option>
        {filteredConnections.map((conn) => (
          <option key={conn.id} value={conn.id}>
            {conn.name}
          </option>
        ))}
      </select>
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Secret field component
 */
interface SecretFieldProps extends BaseFieldProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const SecretField: React.FC<SecretFieldProps> = ({
  label,
  description,
  required,
  error,
  disabled,
  value,
  onChange,
  placeholder,
}) => {
  const [showSecret, setShowSecret] = React.useState(false);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          type={showSecret ? 'text' : 'password'}
          className={`
            w-full px-3 py-2 pr-10 border rounded-md text-sm
            ${error ? 'border-red-500' : 'border-gray-300'}
            ${disabled ? 'bg-gray-100' : 'bg-white'}
          `}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          onClick={() => setShowSecret(!showSecret)}
          tabIndex={-1}
        >
          {showSecret ? '🙈' : '👁️'}
        </button>
      </div>
      
      {description && (
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      )}
      {error && (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
};

/**
 * Property renderer that dispatches to the correct field component
 */
interface PropertyFieldProps {
  property: PropertyConfig;
  value: any;
  onChange: (value: any) => void;
  error?: string;
  disabled?: boolean;
  connections?: Array<{ id: string; name: string; type: string }>;
}

export const PropertyField: React.FC<PropertyFieldProps> = ({
  property,
  value,
  onChange,
  error,
  disabled,
  connections,
}) => {
  const baseProps = {
    name: property.name,
    label: property.label,
    description: property.description,
    required: property.required,
    error,
    disabled,
  };

  switch (property.type) {
    case 'string':
      const stringProp = property as StringPropertyConfig;
      return (
        <TextField
          {...baseProps}
          value={value}
          onChange={onChange}
          multiline={stringProp.multiline}
          placeholder={property.placeholder}
          type={stringProp.secret ? 'password' : 'text'}
          minLength={stringProp.minLength}
          maxLength={stringProp.maxLength}
          pattern={stringProp.pattern}
        />
      );

    case 'number':
      const numberProp = property as NumberPropertyConfig;
      return (
        <NumberField
          {...baseProps}
          value={value}
          onChange={onChange}
          min={numberProp.min}
          max={numberProp.max}
          step={numberProp.step}
          placeholder={property.placeholder}
        />
      );

    case 'boolean':
      return (
        <CheckboxField
          {...baseProps}
          checked={value}
          onChange={onChange}
        />
      );

    case 'select':
      const selectProp = property as SelectPropertyConfig;
      return (
        <SelectField
          {...baseProps}
          value={value}
          onChange={onChange}
          options={selectProp.options as any}
          allowCustom={selectProp.allowCustom}
          placeholder={property.placeholder}
        />
      );

    case 'multiselect':
      const multiProp = property as MultiSelectPropertyConfig;
      return (
        <MultiSelectField
          {...baseProps}
          value={value || []}
          onChange={onChange}
          options={multiProp.options as any}
        />
      );

    case 'json':
      const jsonProp = property as JsonPropertyConfig;
      return (
        <JsonField
          {...baseProps}
          value={value}
          onChange={onChange}
          schema={jsonProp.schema as object}
        />
      );

    case 'code':
      const codeProp = property as CodePropertyConfig;
      return (
        <CodeField
          {...baseProps}
          value={value}
          onChange={onChange}
          language={codeProp.language}
        />
      );

    case 'connection':
      const connProp = property as ConnectionPropertyConfig;
      return (
        <ConnectionField
          {...baseProps}
          value={value}
          onChange={onChange}
          connectionType={connProp.connectionType}
          connections={connections}
        />
      );

    case 'secret':
      return (
        <SecretField
          {...baseProps}
          value={value}
          onChange={onChange}
          placeholder={property.placeholder}
        />
      );

    default:
      return (
        <TextField
          {...baseProps}
          value={value}
          onChange={onChange}
          placeholder={property.placeholder}
        />
      );
  }
};

/**
 * Main Property Panel component
 */
export const PropertyPanel: React.FC<PropertyPanelProps & {
  properties: PropertyConfig[];
  connections?: Array<{ id: string; name: string; type: string }>;
}> & {
  TextField: typeof TextField;
  NumberField: typeof NumberField;
  CheckboxField: typeof CheckboxField;
  SelectField: typeof SelectField;
  MultiSelectField: typeof MultiSelectField;
  JsonField: typeof JsonField;
  CodeField: typeof CodeField;
  ConnectionField: typeof ConnectionField;
  SecretField: typeof SecretField;
} = ({ properties: propConfigs, values, onChange, errors = {}, connections }) => {
  return (
    <div className="space-y-4">
      {propConfigs.map((property) => (
        <PropertyField
          key={property.name}
          property={property}
          value={values[property.name]}
          onChange={(value) => onChange(property.name, value)}
          error={errors[property.name]}
          connections={connections}
        />
      ))}
    </div>
  );
};

// Attach sub-components
PropertyPanel.TextField = TextField;
PropertyPanel.NumberField = NumberField;
PropertyPanel.CheckboxField = CheckboxField;
PropertyPanel.SelectField = SelectField;
PropertyPanel.MultiSelectField = MultiSelectField;
PropertyPanel.JsonField = JsonField;
PropertyPanel.CodeField = CodeField;
PropertyPanel.ConnectionField = ConnectionField;
PropertyPanel.SecretField = SecretField;

export default PropertyPanel;
