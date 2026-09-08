import { registerExecutionChannel, executionChannelView, callExecutionChannel } from "../../../../../scripts/lib/execution-channel.mjs";
import { createHash } from "node:crypto";
import { ExecutionConflict, type ExecutionCoordinator } from "../../../../../scripts/lib/execution-coordinator.mjs";

type Endpoint = {
  coordinator:ExecutionCoordinator;
  key: string;
  owner: string;
  generation: string;
  turnId: () => string;
  steer: boolean;
  request: (method: "turn/steer" | "turn/interrupt", params: Record<string, unknown>) => Promise<unknown>;
};
// Live channels only. Durable ownership is verified for every operation in SQLite.
const channels = new Map<string, Endpoint>();
export function registerNativeControl(endpoint: Endpoint) {
  channels.set(endpoint.key,endpoint);
  const close=registerExecutionChannel(endpoint.coordinator,endpoint.key,{
    view:()=>localControlView(endpoint.coordinator,endpoint.key),
    call:input=>controlNativeTurn(endpoint.coordinator,endpoint.key,input.expectedTurnId,input.action,input.params),
  });
  return () => {close(); if (channels.get(endpoint.key) === endpoint) channels.delete(endpoint.key); };
}
function localControlView(coordinator: ExecutionCoordinator, key: string) {
  const channel = channels.get(key);
  const resource = createHash("sha256").update(key).digest("hex");
  if (!channel || !channel.turnId() || !coordinator.claims().some(row=>row.resource===resource && row.owner===channel.owner && row.generation===channel.generation)) return null;
  return {nativeTurnId:channel.turnId(),steer:channel.steer,interrupt:true,owner:channel.owner,generation:channel.generation};
}
export function nativeControlView(coordinator:ExecutionCoordinator,key:string) {
  const local=localControlView(coordinator,key);
  if(local)return local;
  const remote=executionChannelView(coordinator,key);
  const resource=createHash("sha256").update(key).digest("hex");
  if(!remote || !remote.nativeTurnId || !coordinator.claims().some(row=>row.resource===resource && row.owner===remote.owner && row.generation===remote.generation))return null;
  return {nativeTurnId:String(remote.nativeTurnId),steer:Boolean(remote.steer),interrupt:true,owner:String(remote.owner),generation:String(remote.generation)};
}
export async function controlNativeTurn(coordinator: ExecutionCoordinator, key: string, expectedTurnId: string, action: "steer" | "interrupt", params: Record<string, unknown>) {
  const view=nativeControlView(coordinator,key), channel=channels.get(key);
  if (!view) throw new ExecutionConflict("control_connection_expired");
  if (view.nativeTurnId !== expectedTurnId) throw new ExecutionConflict("control_turn_changed");
  const threadId = /^native:storage-v2:[^:]+:(.*)$/.exec(key)?.[1];
  if (!threadId || params.threadId !== threadId || (action === "steer" ? params.expectedTurnId : params.turnId) !== expectedTurnId) throw new ExecutionConflict("control_target_invalid");
  if (action === "steer" && !view.steer) throw new ExecutionConflict("steer_unavailable_for_phase");
  if (!channel)return callExecutionChannel(coordinator,key,{expectedTurnId,action,params});
  return channel.request(action === "steer" ? "turn/steer" : "turn/interrupt",params);
}
