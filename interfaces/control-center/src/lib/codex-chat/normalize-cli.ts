import type { ChatItemView } from './types';
import { normalizeNativeItem } from './normalize';

// Adapted at function scope from NeuralDeep 0.2.0; native normalization remains canonical.
const object=(value:unknown)=>value && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:null;
export function normalizeCliItem(chatId:string,raw:unknown,root:string,createdAt:string):ChatItemView|null {
  const item=object(raw);if(!item)return null;
  const mapped:Record<string,string>={agent_message:'agentMessage',reasoning:'reasoning',command_execution:'commandExecution',file_change:'fileChange',mcp_tool_call:'mcpToolCall',dynamic_tool_call:'dynamicToolCall',collab_agent_tool_call:'collabAgentToolCall',web_search:'webSearch',todo_list:'plan'};
  const command=typeof item.command==='string'?item.command:Array.isArray(item.command)?item.command.map(String).join(' '):'';
  return normalizeNativeItem(chatId,{...item,type:mapped[String(item.type)] || item.type,status:item.status==='in_progress'?'inProgress':item.status,
    command,aggregatedOutput:item.aggregated_output ?? item.aggregatedOutput,exitCode:item.exit_code ?? item.exitCode,text:item.text ?? item.message,tool:item.tool ?? item.name},root,createdAt);
}
export function cliItemOriginalText(raw:unknown,normalized:ChatItemView):string|undefined {
  const item=object(raw);if(!item)return undefined;
  if(normalized.kind==='assistant_message')return String(item.text ?? item.message ?? '');
  if(normalized.kind==='command')return [Array.isArray(item.command)?item.command.map(String).join(' '):String(item.command ?? ''),item.aggregated_output ?? item.aggregatedOutput].filter(value=>value!=null).join('\n\n');
  if(normalized.kind==='file_change')return (Array.isArray(item.changes)?item.changes:[]).map(entry=>String(object(entry)?.diff ?? '')).filter(Boolean).join('\n');
  if(normalized.kind==='reasoning_summary')return Array.isArray(item.summary)?item.summary.map(String).join('\n\n'):undefined;
  if(normalized.kind==='tool'){
    const result=object(item.result),content=Array.isArray(result?.content)?result.content:[];
    const text=content.map(entry=>object(entry)).filter(entry=>entry?.type==='text' && typeof entry.text==='string').map(entry=>String(entry!.text)).join('\n\n');
    const error=typeof item.error==='string'?item.error:object(item.error)?.message;
    return [text,typeof error==='string'?error:''].filter(Boolean).join('\n\n') || undefined;
  }
  return undefined;
}
