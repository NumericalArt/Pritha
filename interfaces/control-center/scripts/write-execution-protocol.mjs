import { readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
const dist=path.resolve(process.cwd(),process.env.PRITHA_CONTROL_CENTER_DIST_DIR || '.next');
const buildId=readFileSync(path.join(dist,'BUILD_ID'),'utf8').trim();
writeFileSync(path.join(dist,'pritha-execution-protocol.json'),JSON.stringify({schema:'pritha-execution-build-v1',version:1,buildId})+'\n');
