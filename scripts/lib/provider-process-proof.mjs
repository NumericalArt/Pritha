import { processSnapshot,processTreeExited } from '../neuraldeep/process-snapshot.mjs';

/** A turn may own the CLI and several host tool trees. One exited root is never
 * sufficient evidence for releasing all of that turn's workspace claims. */
export function providerProcessTreesExited(proof,snapshot){
  const rows=snapshot || processSnapshot();
  if(proof?.kind!=='provider-process-set')return processTreeExited(proof,rows);
  if(proof.version!==1 || !Array.isArray(proof.trees) || proof.trees.length<1 || proof.trees.length>129 || !proof.trees.some(row=>row.id==='cli')
      || new Set(proof.trees.map(row=>row.id)).size!==proof.trees.length)return false;
  return proof.trees.every(row=>typeof row.id==='string' && processTreeExited(row.evidence,rows));
}
