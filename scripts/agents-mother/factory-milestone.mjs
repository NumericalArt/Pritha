// A finished controller turn is not a finished child. Both entry points use
// this presentation from the same bound evidence; neither infers it from text.
export function factoryMilestone(state,delivery,firstUse) {
  const at=(kind,label,summary)=>({kind,label,summary});
  if(delivery?.status==='accepted' && delivery.acceptance==='accepted')return at('accepted','Готово',state?.phase==='card-blocked'?'Агент уже принят. Карточка управления ещё не готова.':'Пользователь принял проверенную версию.');
  if(delivery?.blockers.length){const b=delivery.blockers[0];return at('decision','Нужно решение',b.title+'. '+b.question);}
  if(['cancelled','failed','abandoned','paused'].includes(delivery?.status))return at('stopped','Остановлено','Сборка остановлена. Уже созданные материалы сохранены.');
  if(state?.phase==='card-blocked')return at('partial','Карточка не готова',firstUse?'Интерфейсы агента проверены. Можно попробовать указанную сборку; карточка управления ещё не готова.':'Проверки сборки прошли; карточка управления ещё не готова.');
  if(['verified','awaiting_acceptance','accepted'].includes(delivery?.status))return at('review','Проверено',firstUse?'Проверенная версия доступна для первого запуска. Приёмка — отдельное решение.':'Проверки записаны. Команда для текущей версии ещё не подтверждена.');
  if(delivery?.status==='verifying')return at('verifying','Проверяю','Выполняются проверки согласованного результата.');
  if(state?.continuationPause)return at('stopped','Остановлено','Шаг фабрики остановился. Результаты предыдущей операции сохранены.');
  if(state?.outcomeApproval)return at('building','Создаю','Фабрика готовит и проверяет агента в согласованных пределах.');
  return at('proposal','Уточняю задачу','Сначала отдельно согласуем возможности агента и способ проверки результата.');
}

export function factoryVoiceDisplay(raw,turnComplete,product) {
  const accepted=product?.kind==='accepted';
  const complete=turnComplete && (raw!=='complete' || !product || accepted);
  const status=raw==='complete' && !complete && product
    ? ['decision','stopped','partial','review','proposal'].includes(product.kind)?'waiting_for_operator':'running' : raw;
  const ceiling=!product || accepted?100:({proposal:10,reconcile:10,building:55,verifying:80,partial:85,review:95})[product.kind] ?? 55;
  return {complete,status,ceiling};
}
