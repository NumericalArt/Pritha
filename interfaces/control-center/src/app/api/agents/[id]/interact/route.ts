import {getAgentInteraction,runAgentInteraction} from '@/lib/control-center/server';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  try{const result=await getAgentInteraction((await context.params).id);return Response.json(result || {error:'agent_interaction_unavailable'},{status:result?200:404});}
  catch{return Response.json({error:'agent_verification_changed'},{status:409});}
}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  try{
    const reader=request.body?.getReader();if(!reader)throw Error();let size=0;const parts:Uint8Array[]=[];
    for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return Response.json({error:'agent_input_invalid'},{status:413});}parts.push(value);}
    return Response.json(await runAgentInteraction((await context.params).id,JSON.parse(Buffer.concat(parts).toString('utf8')),request.signal));
  }catch(error){const code=(error as {code?:string}).code;return Response.json({error:code && /^agent_[a-z_]+$/.test(code)?code:'agent_input_invalid'},{status:409});}
}
