import type { MappingConfig } from "@/lib/trace/types";

export type WizardConfig = MappingConfig & {
  savedAt: string;
};
