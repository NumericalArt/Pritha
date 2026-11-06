import type {ProviderTaskRuntime} from './provider-task-runtime.mjs';
import type {ProviderChatBinding} from './provider-chat-registry.mjs';
import type {StartTurnInput} from '../../interfaces/control-center/src/lib/codex-chat/native-gateway';
import type {ThreadDetail} from '../../interfaces/control-center/src/lib/codex-chat/types';
export function factoryControlInput(binding:ProviderChatBinding,input:StartTurnInput):StartTurnInput['factoryAction']|null;
export function factoryControlView(runtime:ProviderTaskRuntime,binding:ProviderChatBinding):ThreadDetail['factoryControl'];
