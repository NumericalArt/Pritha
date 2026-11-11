import {runChildModelRequest} from '@/lib/control-center/server';

export const dynamic='force-dynamic';
export async function POST(request:Request){
  try{
    const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if(!token)return Response.json({error:'pritha_connection_invalid'},{status:401});
    const reader=request.body?.getReader();if(!reader)return Response.json({error:'provider_input_invalid'},{status:400});
    let bytes=0;const chunks:Uint8Array[]=[];
    for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>40000){await reader.cancel();return Response.json({error:'provider_input_invalid'},{status:413});}chunks.push(value);}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return Response.json(await runChildModelRequest(token,input,request.signal));
  }catch(error){
    const code=(error as {code?:string}).code || '';
    return Response.json({error:/^(pritha_|provider_|runtime_identity_)[a-z_]+$/.test(code)?code:'pritha_connection_unavailable'},{status:code==='provider_input_invalid'?400:code==='provider_rate_limited'?429:503});
  }
}
