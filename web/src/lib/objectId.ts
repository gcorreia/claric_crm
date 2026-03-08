/**
 * Minimal object-id validation for UI routing.
 *
 * Accepts:
 * - Numeric legacy IDs: "123"
 * - Hashed IDs: PREFIX(3, A-Z0-9) + 12 base62 chars, optional 3 checksum chars (A-Z0-5)
 *
 * Examples:
 * - USR5QO5XJUCSbugX3D
 * - BUS5QO5XJUCSbugX3D
 */
const LEGACY_NUMERIC_RE = /^[0-9]+$/;
const HASHED_ID_RE = /^[A-Z0-9]{3}[0-9A-Za-z]{12}([A-Z0-5]{3})?$/;

export function isValidObjectId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  return LEGACY_NUMERIC_RE.test(v) || HASHED_ID_RE.test(v);
}