export const LOCAL_APPLICATION_POLICY='fast-forward-after-verification';
export const LOCAL_APPLICATION_TEXT='Approval of this Outcome also authorizes Pritha to fast-forward the unchanged local child project to the exact independently verified commit. No service is started, no remote is updated, and final user acceptance remains separate. If the project changed, preserve it and report the conflict.';
export function localApplicationAuthorized(outcome){
  return outcome.frontmatter?.local_application===LOCAL_APPLICATION_POLICY && outcome.text.includes(LOCAL_APPLICATION_TEXT);
}
