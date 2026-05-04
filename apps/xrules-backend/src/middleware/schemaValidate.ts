// Lightweight JSON Schema 2020-12 validator (subset). Real-world should use Ajv,
// but we avoid the dep for now. Supports: type, properties, required, additionalProperties,
// minimum/maximum, minLength/maxLength, enum, items, pattern.
import { Request, Response, NextFunction } from 'express';

type Schema = any;

interface ValidationError { path: string; message: string }

export function validate(value: any, schema: Schema, path = '$'): ValidationError[] {
  if (!schema || typeof schema !== 'object') return [];
  const errs: ValidationError[] = [];

  if (schema.type) {
    const ok = checkType(value, schema.type);
    if (!ok) {
      errs.push({ path, message: `expected ${schema.type}, got ${typeOf(value)}` });
      return errs;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errs.push({ path, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errs.push({ path, message: `< ${schema.minimum}` });
    if (typeof schema.maximum === 'number' && value > schema.maximum) errs.push({ path, message: `> ${schema.maximum}` });
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) errs.push({ path, message: `length < ${schema.minLength}` });
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) errs.push({ path, message: `length > ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push({ path, message: `does not match pattern ${schema.pattern}` });
  }

  if (typeOf(value) === 'object' && schema.type === 'object') {
    if (schema.required && Array.isArray(schema.required)) {
      for (const k of schema.required) {
        if (!(k in value)) errs.push({ path: `${path}.${k}`, message: 'required' });
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries<any>(schema.properties)) {
        if (k in value) errs.push(...validate(value[k], sub, `${path}.${k}`));
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      const allowed = new Set(Object.keys(schema.properties));
      for (const k of Object.keys(value)) {
        if (!allowed.has(k)) errs.push({ path: `${path}.${k}`, message: 'additional property not allowed' });
      }
    }
  }

  if (Array.isArray(value) && schema.type === 'array') {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errs.push({ path, message: `length < ${schema.minItems}` });
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errs.push({ path, message: `length > ${schema.maxItems}` });
    if (schema.items) {
      value.forEach((item, i) => errs.push(...validate(item, schema.items, `${path}[${i}]`)));
    }
  }

  return errs;
}

function checkType(v: any, t: string | string[]): boolean {
  const types = Array.isArray(t) ? t : [t];
  const actual = typeOf(v);
  return types.some(x => x === actual || (x === 'integer' && actual === 'number' && Number.isInteger(v)));
}

function typeOf(v: any): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

// Express middleware factory — validates req.body[bodyKey] against a schema
export function validateBody(schemaProvider: (req: Request) => Promise<any | null> | any | null, bodyKey = 'input') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const schema = await schemaProvider(req);
      if (!schema) return next();
      const value = (req.body || {})[bodyKey];
      const errs = validate(value, schema);
      if (errs.length) {
        res.status(400).json({
          success: false,
          error: { code: 'SCHEMA_VALIDATION', message: 'Input does not match schema', details: errs },
        });
        return;
      }
      next();
    } catch (e) { next(e); }
  };
}
