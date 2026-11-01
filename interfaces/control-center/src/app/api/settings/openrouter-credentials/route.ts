import {providerCredentialsRequest} from '@/lib/settings/provider-credentials';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return providerCredentialsRequest(request,'openrouter');}
export async function POST(request:Request){return providerCredentialsRequest(request,'openrouter');}
