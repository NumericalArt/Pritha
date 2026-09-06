export type BudgetIntent =
  | { kind: "none" }
  | { kind: "clarification"; message: string }
  | { kind: "goal_budget"; mode: "add" | "set"; tokens: number; resume: boolean };

const clarification: BudgetIntent = {
  kind: "clarification",
  message: "Укажите объект и изменение бюджета: например, «добавь 100 000 токенов к бюджету этой задачи» или «установи бюджет этой задачи до 500 000 токенов». Для продолжения добавьте «и продолжай». Бюджет сборки и лимиты аккаунта управляются отдельно.",
};
const taskBudget = "(?:бюджет(?:у)? (?:этой |текущей )?задачи|(?:бюджет(?:у)? )?goal)";
const rules: Array<{ mode: "add" | "set"; pattern: RegExp }> = [
  { mode: "add", pattern: new RegExp(`^добавь(?:те)? (?:ещ[её] )?(.+?) токен(?:ов|а)? (?:к |в )${taskBudget}$`, "iu") },
  { mode: "add", pattern: new RegExp(`^добавь(?:те)? к ${taskBudget} (?:ещ[её] )?(.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", pattern: new RegExp(`^увеличь(?:те)? ${taskBudget} на (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "set", pattern: new RegExp(`^(?:установи(?:те)?|увеличь(?:те)?|подними(?:те)?) ${taskBudget} (?:до|в|на уровне) (.+?) токен(?:ов|а)?$`, "iu") },
  { mode: "add", pattern: /^add (?:another )?(.+?) tokens? to (?:this |the current )task budget$/iu },
  { mode: "set", pattern: /^set (?:this |the current )task budget to (.+?) tokens?$/iu },
];

// Only a complete, direct operator command is eligible. Quoted instructions,
// forwarded text, prose, attachments and model output are never authorization.
export function parseBudgetIntent(value: string): BudgetIntent {
  const raw = value.trim();
  if (!raw || /^[>"'«“`]/u.test(raw)) return { kind: "none" };
  if (!/^(?:(?:добавь(?:те)?|увеличь(?:те)?|установи(?:те)?|подними(?:те)?)\s+(?:(?:к\s+)?бюджет|лимит|goal|(?:ещ[её]\s+)?[+\-\d])|(?:add|set)\s+(?:another\s+|this\s+|the current\s+|[+\-\d]))/iu.test(raw)) return { kind: "none" };
  if (!/(?:токен|бюджет|лимит|goal|token|budget)/iu.test(raw)) return { kind: "none" };
  if (raw.length > 500 || /[\r\n"'«»“”`]/u.test(raw)) return clarification;
  let text = raw.replace(/[.!]$/u, "").replace(/[\u00a0\u202f]/gu, " ").replace(/\s+/gu, " ");
  const resume = /(?:[,;]? и продолжай(?:те)?|[,;]? and (?:continue|resume))$/iu.test(text);
  if (resume) text = text.replace(/(?:[,;]? и продолжай(?:те)?|[,;]? and (?:continue|resume))$/iu, "");
  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const amount = match[1];
    // A separator consistently groups triples; decimals and mixed groups need
    // clarification instead of a surprising interpretation of the amount.
    if (!/^(?:\d+|\d{1,3}([ _,.])\d{3}(?:\1\d{3})*)$/u.test(amount)) return clarification;
    const tokens = Number(amount.replace(/[ _,.]/gu, ""));
    if (!Number.isSafeInteger(tokens) || tokens < 1) return clarification;
    return { kind: "goal_budget", mode: rule.mode, tokens, resume };
  }
  return clarification;
}
