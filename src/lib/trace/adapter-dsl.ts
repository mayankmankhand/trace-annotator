// Custom adapter JSON DSL parser (v3, #16).
//
// Power users in experienced mode can paste a JSON object that describes how
// to extract input/output messages from a non-standard trace shape. This
// bypasses the wizard mapping step on subsequent file loads.
//
// The DSL is intentionally a thin wrapper over MappingConfig. Anything the
// wizard can produce, the DSL can express, plus optional dot-notation in
// field names so users can target nested objects without flattening their
// file first.
//
// Schema (all string fields support dot-notation, e.g. "data.messages"):
//   {
//     "idField": "trace_id",          // optional, null/omitted -> auto-numbered
//     "inputField": "messages",        // required
//     "outputField": "messages",       // required (same as inputField means "single conversation")
//     "metadataPassthrough": true,     // optional, default true
//     "roleAliases": [                 // optional
//       { "from": "human", "to": "user" }
//     ]
//   }

import type { MappingConfig, Role, RoleAlias } from "./types";
import { validateFieldPath } from "./mapping";

const VALID_ROLES: ReadonlyArray<Role> = ["user", "assistant", "system", "tool"];

export type AdapterParseResult =
  | { ok: true; config: MappingConfig }
  | { ok: false; error: string };

export function parseAdapterDSL(raw: string): AdapterParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, error: "Adapter is empty." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    return {
      ok: false,
      error: `Invalid JSON: ${(e as Error).message}`,
    };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Adapter must be a JSON object." };
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.inputField !== "string" || obj.inputField.trim() === "") {
    return {
      ok: false,
      error: "'inputField' is required and must be a non-empty string.",
    };
  }
  if (typeof obj.outputField !== "string" || obj.outputField.trim() === "") {
    return {
      ok: false,
      error: "'outputField' is required and must be a non-empty string.",
    };
  }
  // Reject paths that walk into __proto__/constructor/prototype - prevents
  // a pasted adapter from being a prototype-pollution vector.
  const inputPathError = validateFieldPath(obj.inputField);
  if (inputPathError) return { ok: false, error: inputPathError };
  const outputPathError = validateFieldPath(obj.outputField);
  if (outputPathError) return { ok: false, error: outputPathError };

  let idField: string | null = null;
  if ("idField" in obj && obj.idField !== null && obj.idField !== undefined) {
    if (typeof obj.idField !== "string") {
      return {
        ok: false,
        error: "'idField' must be a string or null.",
      };
    }
    const idPathError = validateFieldPath(obj.idField);
    if (idPathError) return { ok: false, error: idPathError };
    idField = obj.idField;
  }

  let roleAliases: RoleAlias[] | undefined;
  if (obj.roleAliases !== undefined) {
    if (!Array.isArray(obj.roleAliases)) {
      return {
        ok: false,
        error: "'roleAliases' must be an array.",
      };
    }
    roleAliases = [];
    for (let i = 0; i < obj.roleAliases.length; i++) {
      const a = obj.roleAliases[i];
      if (
        a === null ||
        typeof a !== "object" ||
        Array.isArray(a) ||
        typeof (a as Record<string, unknown>).from !== "string" ||
        typeof (a as Record<string, unknown>).to !== "string"
      ) {
        return {
          ok: false,
          error: `roleAliases[${i}] must be an object with string 'from' and string 'to'.`,
        };
      }
      const to = (a as Record<string, unknown>).to as string;
      if (!VALID_ROLES.includes(to as Role)) {
        return {
          ok: false,
          error: `roleAliases[${i}].to must be one of: ${VALID_ROLES.join(", ")}.`,
        };
      }
      roleAliases.push({
        from: (a as Record<string, unknown>).from as string,
        to: to as Role,
      });
    }
  }

  // Strict boolean check. Earlier versions silently coerced any non-true
  // value (including the string "true") to false; that contradicted the
  // explicit-error convention used everywhere else in this validator.
  let metadataPassthrough = true;
  if (obj.metadataPassthrough !== undefined) {
    if (typeof obj.metadataPassthrough !== "boolean") {
      return {
        ok: false,
        error:
          "'metadataPassthrough' must be a boolean (true or false), not a string or number.",
      };
    }
    metadataPassthrough = obj.metadataPassthrough;
  }

  const config: MappingConfig = {
    idField,
    inputField: obj.inputField,
    outputField: obj.outputField,
    metadataPassthrough,
    ...(roleAliases ? { roleAliases } : {}),
  };
  return { ok: true, config };
}

// Convenience example shown to first-time users in the editor placeholder.
export const ADAPTER_EXAMPLE = `{
  "idField": "trace_id",
  "inputField": "messages",
  "outputField": "messages",
  "metadataPassthrough": true,
  "roleAliases": [
    { "from": "human", "to": "user" },
    { "from": "ai", "to": "assistant" }
  ]
}`;
