import { z } from "zod";

/**
 * Standard tagged union returned by all Next.js 15 Server Actions.
 * Guarantees a deterministic contract across the mutation boundary:
 * callers inspect `result.success` to branch on success data or failure message.
 * Also provides `ok` for full backward compatibility across callers.
 */
export type ServerActionResult<T = void> =
  | { success: true; ok: true; data: T; error?: undefined }
  | { success: false; ok: false; error: string; data?: undefined };

/**
 * Legacy alias for backwards compatibility across older callers and helpers.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T; success?: boolean; error?: undefined }
  | { ok: false; error: string; success?: boolean; data?: undefined };

export function actionSuccess<T>(data: T): ServerActionResult<T> {
  return { success: true, ok: true, data };
}

export function actionError<T = void>(error: string): ServerActionResult<T> {
  return { success: false, ok: false, error };
}

export const idParamSchema = z
  .string()
  .trim()
  .min(1, "Identifier is required");

export const accountIdParamSchema = z
  .string()
  .trim()
  .min(1, "Account ID is required");

export const idsArraySchema = z
  .array(z.string().trim().min(1, "Identifier cannot be empty"))
  .min(1, "At least one identifier is required");

export const instructionParamSchema = z
  .string()
  .trim()
  .min(1, "Instruction cannot be empty");
