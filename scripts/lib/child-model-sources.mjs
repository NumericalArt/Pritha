import {readFileSync} from 'node:fs';

// Literal asset URLs are required here: the production bundler cannot resolve a
// variable file name relative to import.meta.url. Keep the verifier and scaffold
// on the same original source bytes in both Node workers and Control Center.
const sources = [
  ['scripts/lib/child-model-client.mjs', new URL('./child-model-client.mjs', import.meta.url)],
  ['scripts/lib/child-provider-configuration.mjs', new URL('./child-provider-configuration.mjs', import.meta.url)],
  ['scripts/lib/provider-http.mjs', new URL('./provider-http.mjs', import.meta.url)],
  ['scripts/claude/messages-client.mjs', new URL('../claude/messages-client.mjs', import.meta.url)],
  ['scripts/claude/stream-state.mjs', new URL('../claude/stream-state.mjs', import.meta.url)],
];

export function childModelSourceFiles() {
  return sources.map(([path, url]) => ({path, content: readFileSync(url, 'utf8')}));
}
