export type FactoryPhase='interview'|'contract'|'outcome'|'scaffold'|'implement'|'verify'|'finish';
export type FactoryIntent={action:'create-new-agent';slug:string};
export function normalizeFactoryIntent(value:unknown):FactoryIntent|null;
export type ChatSubject={kind:'child';slug:string;phase:FactoryPhase};
export const FACTORY_PHASES:ReadonlyArray<{id:FactoryPhase;label:string;goal:string}>;
export class ChatSubjectError extends Error {code:'chat_subject_invalid';status:400;}
export function normalizeChatSubject(value:unknown):ChatSubject|null;
export function factorySubjectInstructions(value:unknown):string;
