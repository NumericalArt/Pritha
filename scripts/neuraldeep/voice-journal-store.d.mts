import type { ExecutionCoordinator } from '../lib/execution-coordinator.mjs';
import type { NeuralDeepVoiceJournal } from './voice-journal.mjs';
export function openVoiceJournal(options: { stateRoot: string; directory?: string }): { coordinator: ExecutionCoordinator; journal: NeuralDeepVoiceJournal; close(): void };
