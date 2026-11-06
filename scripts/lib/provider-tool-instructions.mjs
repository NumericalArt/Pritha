/** Describe the actual host surface without granting any additional authority. */
export function providerToolInstructions(definitions) {
  const names=[...new Set((definitions || []).map(tool=>tool?.name).filter(name=>typeof name==='string' && /^[a-z_]{1,60}$/.test(name)))];
  if(!names.length)return '';
  return [
    'Pritha host tool routing:',
    'Use only the exact declared MCP functions: '+names.map(name=>'mcp__pritha__'+name).join(', ')+'.',
    'This task does not expose the built-in apply_patch or shell tools. Do not invent a built-in tool call when a host function is available.',
    ...(names.includes('read_file')?['Read file contents with the declared read_file function.']:[]),
    ...(names.includes('list_files')?['List workspace entries with the declared list_files function.']:[]),
    ...(names.includes('edit_file')?['For an authorized edit, use edit_file with its exact current expected_sha256 and a unique old_text.']:[]),
    ...(names.includes('write_file')?['For an authorized complete file write, use write_file with expected_sha256 from read_file, or null only for a new file.']:[]),
    ...(names.includes('run_command')?['For an authorized command, use run_command with an argv array.']:[]),
    ...(names.some(name=>name.startsWith('factory_'))?['Agent-creation phases must use the declared factory functions and their saved workflow; generic file/command functions do not replace those gates.']:[]),
    'Tool availability grants no write, command, network, budget or document approval. Host policy and pending approval decisions remain authoritative.',
  ].join('\n');
}
