import path from 'node:path';
import {createHash} from 'node:crypto';
import {readBoundedRegularFile} from '../lib/safe-file-read.mjs';
import {inspectProtectedTrialInputs} from './delivery-worktree.mjs';

const fail=code=>Object.assign(new Error('Review the prepared, independently verified Trial inputs.'),{code});

// Prepared files are host-owned inputs, not a model-selected source directory.
// Approval checks their hashes before any child exists; scaffold checks again
// and includes only these declared bytes in the initial clean Git baseline.
export function preparedTrialInputFiles(plan,inputRoot){
  return inspectProtectedTrialInputs(plan,inputRoot).map(entry=>{
    if(!entry.path.startsWith('verification/') || !entry.declared_hash)throw fail('prepared_trial_input_review_required');
    const {buffer}=readBoundedRegularFile(path.join(inputRoot,entry.path),{allowedRoots:[inputRoot],maxBytes:16*1024*1024});
    if('sha256:'+createHash('sha256').update(buffer).digest('hex')!==entry.declared_hash)throw fail('prepared_trial_input_changed');
    return {path:entry.path,content:buffer};
  });
}
