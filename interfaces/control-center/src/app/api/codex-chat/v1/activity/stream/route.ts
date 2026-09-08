import { getCodexChatGateway } from "@/lib/codex-chat/gateway";
import { apiError, integerQuery } from "@/lib/codex-chat/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
let connections=0;
export async function GET(request:Request) {
  if(connections>=8)return new Response(null,{status:503,headers:{"Retry-After":"15"}});
  try {
    let cursor=integerQuery(request.headers.get("last-event-id") || new URL(request.url).searchParams.get("after"),0,0,Number.MAX_SAFE_INTEGER);
    const gateway=getCodexChatGateway(),encoder=new TextEncoder();
    let finish=()=>{};
    connections++;
    const stream=new ReadableStream<Uint8Array>({
      start(controller) {
        let closed=false,timer:ReturnType<typeof setTimeout>|undefined;
        finish=()=>{if(closed)return;closed=true;connections--;clearTimeout(timer);request.signal.removeEventListener("abort",finish);try{controller.close();}catch{}};
        const tick=async()=>{
          try {
            const activity=await gateway.activity(cursor);
            if(closed)return;
            cursor=activity.cursor;
            controller.enqueue(encoder.encode(`id: ${cursor}\nevent: activity\ndata: ${JSON.stringify(activity)}\n\n`));
          } catch {finish();return;}
          if(!closed)timer=setTimeout(tick,3_000);
        };
        request.signal.addEventListener("abort",finish,{once:true});
        if(request.signal.aborted)finish();else void tick();
      },
      cancel(){finish();},
    });
    return new Response(stream,{headers:{"Content-Type":"text/event-stream; charset=utf-8","Cache-Control":"no-store","X-Accel-Buffering":"no"}});
  } catch(error){return apiError(error);}
}
