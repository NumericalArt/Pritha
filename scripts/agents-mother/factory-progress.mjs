import {verifiedFirstUse} from './factory-first-use.mjs';
import {voiceFactoryPaths,loadVoiceFactory,requireFactoryApprovals,validateFactoryDelivery,factoryFail} from './voice-factory-state.mjs';
import {deliveryStatus} from './delivery-loop.mjs';
import {deliveryExplanation} from './delivery-explanation.mjs';
import {verifyOutcomeApproval} from './outcome-spec.mjs';

// A finished controller turn is not a finished child. Both entry points use
// this presentation from the same bound evidence; neither infers it from text.
export function factoryMilestone(state,delivery,firstUse) {
  const at=(kind,label,summary)=>({kind,label,summary});
  if(delivery?.blockers.length){const b=delivery.blockers[0];return at('decision','Нужно решение',b.title+'. '+b.question);}
  if(['cancelled','failed','abandoned','paused'].includes(delivery?.status))return at('stopped','Остановлено','Сборка остановлена. Уже созданные материалы сохранены.');
  if(state?.phase==='card-blocked')return at('partial','Карточка не готова',firstUse?'Интерфейсы агента проверены. Можно попробовать указанную сборку; карточка управления ещё не готова.':'Проверки сборки прошли; карточка управления ещё не готова.');
  if(delivery?.status==='accepted' && state?.phase==='accepted')return at('accepted','Готово','Пользователь принял проверенную версию.');
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

/** Used by both thread adapters. No recovery, approvals, tools or model calls on read. */
export function readBoundFactoryProgress(options) {
  if(!options.slug)return undefined;
  try {
    const p=voiceFactoryPaths(options);
    if(p.target!==options.target)throw factoryFail('factory_binding_changed');
    const state=loadVoiceFactory(p,options);
    let delivery=null,firstUse=null;
    if(state?.runId){
      requireFactoryApprovals(p,state);
      if(!verifyOutcomeApproval(state.outcome,p).ok)throw factoryFail('factory_outcome_approval_required');
      const result=validateFactoryDelivery(p,state,deliveryStatus(state.runId,p));
      delivery=deliveryExplanation(result.state);
      firstUse=verifiedFirstUse(p,state,result);
    }
    return {available:true,slug:p.slug,phase:state?.phase || 'not-started',running:Boolean(state?.running),
      documentsApproved:Boolean(state?.contractApproval && state?.outcomeApproval),milestone:factoryMilestone(state,delivery,firstUse),
      builder:{provider:options.connectorId,modelId:state?.buildConfiguration?.modelId || options.model,effort:state?.buildConfiguration?.effort || options.effort || 'none'},delivery,firstUse};
  }catch{return {available:false,errorCode:'factory_evidence_unavailable'};}
}
