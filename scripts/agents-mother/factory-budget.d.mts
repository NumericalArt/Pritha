export type FactoryBudgetOptions={root:string;stateRoot:string;slug:string;chatId:string;connectorId:string;target?:string;agentParent?:string};
export type FactoryBudgetView={version:number;maxTokens:number;maxActiveMs:number;observedTokens:number;chargedTokens:number;remainingTokens:number;activeMs:number;remainingActiveMs:number;preparationTokens:number;buildTokens:number;usageKnown:boolean;uncertainAttempts:number;reservationTokens:number;elapsedMs:number;progressReview:boolean;warning:boolean;accounting:string};
export const FACTORY_STABILITY_BUDGET:{readonly maxTokens:number;readonly maxActiveMs:number;readonly buildIterations:number;readonly buildElapsedMs:number};
export function readFactoryBudget(options:FactoryBudgetOptions):FactoryBudgetView;
export class FactoryBudget {
  constructor(options:FactoryBudgetOptions);
  view():FactoryBudgetView;
  check():FactoryBudgetView;
  ensure():Promise<FactoryBudgetView>;
  checkpoint(id:string,phase:'preparation'|'build',snapshot:{requests:Array<Record<string,any>>}):Promise<FactoryBudgetView>;
  native(id:string,phase:'preparation'|'build',total?:number,activeDeltaMs?:number):Promise<FactoryBudgetView>;
  extend(operationId:string,addition:{tokens?:number;activeMs?:number}):Promise<FactoryBudgetView>;
  observe(id:string,phase:'preparation'|'build',data:{observedTokens:number;chargedTokens:number;activeMs:number;usageKnown:boolean;source?:string},options?:{admission?:boolean}):Promise<FactoryBudgetView>;
  progress(evidence:string):Promise<FactoryBudgetView>;
}
