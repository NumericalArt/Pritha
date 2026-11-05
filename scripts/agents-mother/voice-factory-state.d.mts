type FactoryOptions={root:string;stateRoot:string;slug:string;agentParent?:string};
export function prepareFactoryBinding(options:FactoryOptions):{slug:string;target:string};
export function factoryDraftReceipt(options:FactoryOptions & {chatId:string;connectorId:string}):{draftCreated:boolean;errorCode:string|null};
export function readFactoryConversation(options:FactoryOptions):{chatId:string;connectorId:string;slug:string;target:string}|null;
