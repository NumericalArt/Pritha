import {deliveryUsageStatus} from './delivery-ledger.mjs';

// Project only operator decisions, never provider prose, evidence paths or logs.
const reasons = {
  token_budget_exhausted: ['Исчерпан бюджет сборки', 'Проверить уже сделанное или выделить дополнительный бюджет?'],
  iteration_budget_exhausted: ['Закончились попытки сборки', 'Проверить результат или разрешить ещё одну попытку?'],
  elapsed_budget_exhausted: ['Истекло время сборки', 'Проверить результат или дать сборке больше времени?'],
  isolation_unavailable: ['Недоступна требуемая изоляция', 'Восстановить среду исполнения или пересмотреть требования?'],
  goal_usage_unavailable: ['Уточняется расход предыдущей попытки', 'Как сверить сохранённую попытку?'],
  build_runtime_unavailable: ['Сборщик недоступен', 'Как восстановить выбранного исполнителя?'],
  verification_needs_implementation: ['Продуктовая проверка не прошла', 'Продолжить исправление или посмотреть результаты?'],
  verifier_modified: ['Проверочный файл изменился', 'Как восстановить одобренную проверку?'],
  repeated_trial_failure: ['Проверка повторно не прошла', 'Уточнить задачу или пересмотреть критерии?'],
};
const choices = {
  'verify-only':['Проверить готовые файлы','Запустятся одобренные проверки без новой сборки.'],
  'extend-budget':['Увеличить лимит','Потребуется отдельно одобрить прибавку; прежний расход сохранится.'],
  'review-failures':['Посмотреть результаты','Сборка останется на паузе.'],
  'inspect-worktree':['Посмотреть материалы сборки','Новая попытка не запустится.'],
  'retry-accounting':['Сверить расход','Хост проверит запись исполнителя без повторной отправки.'],
  'retry-after-upgrade':['Повторить после обновления','Сначала хост проверит возможности выбранной среды.'],
  'revise-contract':['Пересмотреть Contract','Изменённые требования потребуют нового решения.'],
  'resume-build':['Продолжить сборку','Исполнитель будет работать в оставшихся пределах.'],
  'revise-outcome':['Пересмотреть результат','Новые критерии потребуют отдельного одобрения.'],
  'stop-run':['Остановить','Работа прекратится; материалы сохранятся.'],
  'abandon':['Завершить попытку','Материалы и учтённый расход сохранятся.'],
};
export function deliveryExplanation(s) {
  const blockers=s.blockers.slice(0,8).map(row=>{
    const known=Object.hasOwn(reasons,row.code);
    const [title,question]=known?reasons[row.code]:['Сборка остановилась','Проверьте сохранённое решение этой сборки.'];
    return {code:row.code,title,question,options:row.options.slice(0,5).map(({id})=>{
      const [label,effect]=Object.hasOwn(choices,id)?choices[id]:[id,'Подробности доступны в решении этой сборки.'];
      return {id,label,effect};
    })};
  });
  return {status:s.status,phase:s.phase,version:s.version,iteration:s.iteration,
    budget:{tokensUsed:s.budget.tokens_used,maxTokens:s.budget.max_tokens,maxIterations:s.budget.max_iterations,
      usageStatus:deliveryUsageStatus(s.budget),overrun:Math.max(0,s.budget.tokens_used-s.budget.max_tokens)},
    acceptance:s.accepted_by==='user'?'accepted':'pending',blockers};
}
