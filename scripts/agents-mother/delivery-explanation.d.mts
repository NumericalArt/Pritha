import type { DeliveryExplanation } from './task-delivery.mjs';

export function deliveryExplanation(state: {
  status: string; phase: string; version: number; iteration: number; accepted_by?: string | null;
  budget: { tokens_used: number; max_tokens: number; max_iterations: number; legacy_usage_unverified?: boolean; unaccounted_attempts?: unknown[] };
  failure_history?: Array<{ trial_ids?: string[] }>;
  blockers: Array<{ code: string; summary?: string; options: Array<{ id: string }> }>;
}): DeliveryExplanation;
