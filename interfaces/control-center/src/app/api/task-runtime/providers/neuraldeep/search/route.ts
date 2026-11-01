import {searchSettingsRequest} from '../../../../../../../../../scripts/search/settings-api.mjs';
import {getNeuralDeepSearch} from '@/lib/voice/search-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return searchSettingsRequest(request,{service:getNeuralDeepSearch()});}
export async function POST(request:Request){return searchSettingsRequest(request,{service:getNeuralDeepSearch()});}
