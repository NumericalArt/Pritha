// A finished controller turn is not a finished child. Both entry points use
// this presentation from the same bound evidence; neither infers it from text.
export function factoryMilestone(state,delivery,firstUse) {
  const at=(kind,label,summary)=>({kind,label,summary});
  if(delivery?.status==='accepted' && delivery.acceptance==='accepted')return at('accepted','Готово',state?.phase==='card-blocked'?'Агент уже принят. Карточка управления ещё не готова.':'Пользователь принял проверенную версию.');
  if(delivery?.blockers.length){const b=delivery.blockers[0];return at('decision','Нужно решение',[b.explanation || b.title,b.nextStep || b.question].join(' '));}
  if(['cancelled','abandoned'].includes(delivery?.status))return at('stopped','Остановлено','Эта сборка завершена без приёмки результата. Материалы сохранены. Для новой работы нужна отдельная команда.');
  if(delivery?.status==='paused')return at('stopped','Приостановлено','Сборка приостановлена. Материалы сохранены. Прита ждёт команды на продолжение.');
  if(delivery?.status==='failed')return at('stopped','Сборка прервана','Сборку не удалось завершить. Прита сохранила материалы и остановила новые попытки. Причину нужно уточнить по журналу сборки перед продолжением.');
  if(state?.continuationPause && !state.running){
    const step=state.continuationPause;
    if(['research','research_collect','research_apply','research_recover'].includes(step))return at('stopped','Исследование приостановлено','Не удалось завершить проверку источников. Прита сохранила результаты исследования и приостановила автопродолжение. Перед сборкой нужно устранить причину и подтвердить источники.');
    if(step==='scaffold')return at('stopped','Создание каркаса приостановлено','Не удалось завершить создание каркаса. Прита сохранила согласованные документы и приостановила автопродолжение. Перед повтором нужно проверить причину в журнале этого шага.');
    if(step==='finish')return at('partial','Передача результата приостановлена','Не удалось завершить подготовку результата к передаче. Прита сохранила сборку и проверки. Нужно устранить причину остановки перед завершением передачи.');
    return at('stopped','Шаг приостановлен','Не удалось завершить текущий шаг. Прита сохранила предыдущие результаты и приостановила автопродолжение. Причина пока не уточнена; перед повтором нужно проверить журнал шага.');
  }
  if(state?.phase==='card-blocked' && state.localApplication?.status==='manual')return at('review','Готов к переносу','Сборка проверена. Для запуска из карточки нужно согласовать её перенос в рабочую папку агента.');
  if(state?.phase==='card-blocked' && state.localApplication?.reason==='source_has_changes')return at('partial','Сохранил ваши изменения','Сборка проверена. В рабочей папке есть изменения; Прита сохранила их и ждёт решения о переносе сборки.');
  if(state?.phase==='card-blocked')return at('partial','Карточка не готова',firstUse?'Интерфейсы агента проверены. Можно попробовать указанную сборку. Прита ждёт устранения проблем в настройках карточки управления.':'Проверки сборки прошли. Прита ждёт устранения проблем в настройках карточки управления.');
  if(firstUse?.disposition==='applied-local-project')return at('review','Готов к запуску','Проверенная версия находится в рабочей папке. Агента можно запустить из карточки. Приёмка — отдельное решение.');
  if(['verified','awaiting_acceptance','accepted'].includes(delivery?.status))return at('review','Проверено',firstUse?'Проверенная версия доступна для первого запуска. Приёмка — отдельное решение.':'Проверки записаны. Команда для текущей версии ещё не подтверждена.');
  if(delivery?.status==='verifying')return at('verifying','Проверяю',delivery.iteration===0?'Каркас готов. Проверяю, какие функции ещё нужно реализовать.':'Реализация готова к проверке. Сверяю поведение агента с согласованными примерами.');
  // These are real delivery stages, not a reinterpretation of a failed turn.
  // Blockers and interrupted steps above always take precedence.
  if(delivery?.status==='building'){
    if(!state?.running)return at('reconcile','Уточняю состояние','Сборка ещё не завершена. Прита ждёт подтверждения текущего шага перед продолжением.');
    if(delivery.lastFailureKind==='executor')return at('building','Восстанавливаю сборку','Не удалось завершить вызов сборщика. Прита проверяет сохранённые файлы перед следующей попыткой в согласованных пределах.');
    if(delivery.phase==='implementation' && delivery.iteration===1 && state.scaffoldRevision)return at('building','Реализую','Каркас готов. Реализую поведение агента');
    if(delivery.phase==='repair' && delivery.iteration===0 && state.scaffoldRevision)return at('building','Готовлю реализацию','Каркас готов. Подготавливаю реализацию поведения агента.');
    if(delivery.phase==='repair' || delivery.iteration>1)return at('building','Исправляю','Проверка выявила несоответствие согласованному результату. Исправляю реализацию в оставшихся пределах, затем повторю проверку.');
    return at('building','Реализую','Создаю реализацию агента. Затем проверю её по согласованным примерам.');
  }
  if(state?.phase==='scaffolded')return at('building','Каркас готов','Каркас готов. Следующий этап — реализация поведения агента и проверка результата.');
  if(state?.phase==='research')return at('building','Изучаю источники','Проверяю источники для выбранного решения. Затем подготовлю каркас агента.');
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
