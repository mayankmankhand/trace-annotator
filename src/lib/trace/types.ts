export type Role = "user" | "assistant" | "system" | "tool";

export type Message = {
  role: Role;
  content: string;
};

export type Trace = {
  id: string;
  input: Message[];
  output: Message[];
  metadata?: Record<string, unknown>;
};

export type ParseFormat = "json" | "jsonl" | "csv";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export type CsvParsed = {
  headers: string[];
  rows: Record<string, string>[];
};

export type MappingConfig = {
  idField: string | null;
  inputField: string;
  outputField: string;
  metadataPassthrough: boolean;
};
