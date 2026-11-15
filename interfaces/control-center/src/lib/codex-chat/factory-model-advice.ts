// A chat that creates an agent drives Pritha's factory tools for the whole
// build. Some models cannot call them reliably, and a chat's model never
// changes later. On 2026-11-15 a gpt-oss-120b chat sent a budget extension four
// times without its amounts, even with field descriptions and a corrective
// hint, so its build could not continue. Say so before the chat is created.
const UNRELIABLE_FACTORY_CHAT_MODELS: Record<string, RegExp> = {
  neuraldeep: /^gpt-oss-/,
};

export function factoryChatModelAdvice(connectorId: string | undefined, modelId: string | undefined): string | null {
  const pattern = connectorId ? UNRELIABLE_FACTORY_CHAT_MODELS[connectorId] : undefined;
  if (!pattern || !modelId || !pattern.test(modelId)) return null;
  return `${modelId} has not reliably called Pritha's factory tools: it dropped required fields and the build could not continue. For creating an agent choose a stronger model such as kimi-k3.1-pro. A chat keeps its model.`;
}
