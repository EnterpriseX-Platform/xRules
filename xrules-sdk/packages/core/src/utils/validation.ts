import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email();

export const nameSchema = z.string().min(1).max(255);

export function validateUuid(id: string): boolean {
  return uuidSchema.safeParse(id).success;
}

export function validateEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

export function validateRequired<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function validateStringLength(
  value: string,
  min: number,
  max: number
): boolean {
  return value.length >= min && value.length <= max;
}

export function validateJsonString(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function validateUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
