import {providerCredentialsRequest} from '@/lib/settings/provider-credentials';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{connectorId:string}>};
export async function GET(request:Request,context:Context){return providerCredentialsRequest(request,(await context.params).connectorId);}
export async function POST(request:Request,context:Context){return providerCredentialsRequest(request,(await context.params).connectorId);}
