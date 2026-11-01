import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, lstatSync, realpathSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProviderConnectorId } from './provider-profile.mjs';

/** Only process necessities cross into a provider CLI, never the host's credential bag. */
export function providerProcessEnvironment({provider,root,stateRoot,codexHome,claudeConfigDir,temporary,env=process.env}) {
  if(!isProviderConnectorId(provider))throw new Error('provider_profile_invalid');
  const result={};
  for(const key of ['PATH','HOME','USER','LOGNAME','SHELL','SystemRoot','WINDIR'])if(typeof env[key]==='string')result[key]=env[key];
  const locale=String(env.LC_ALL || env.LANG || '');
  result.LANG=/^[A-Za-z0-9_.@-]{1,80}$/.test(locale) && /utf-?8/i.test(locale) ? locale : 'en_US.UTF-8';
  result.LC_ALL=result.LANG;result.NO_PROXY='127.0.0.1,::1,localhost';result.no_proxy=result.NO_PROXY;
  result.PRITHA_ROOT=path.resolve(root);result.TECHSCOPE_ROOT=result.PRITHA_ROOT;
  result.PRITHA_STATE_ROOT=path.resolve(stateRoot);
  if(temporary)result.TMPDIR=path.resolve(temporary);
  if(codexHome && ['neuraldeep','openrouter','local'].includes(provider))result.CODEX_HOME=path.resolve(codexHome);
  if(claudeConfigDir && provider==='claude')result.CLAUDE_CONFIG_DIR=path.resolve(claudeConfigDir);
  return result;
}

/** ASCII-only private scratch directory for CLIs with filesystem encoding assumptions. */
export function createProviderTemporaryDirectory({provider,stateRoot,temporaryRoot=os.tmpdir()}) {
  if(!isProviderConnectorId(provider))throw new Error('provider_profile_invalid');
  const parent=path.resolve(temporaryRoot);
  if(!/^[\x20-\x7e]+$/.test(parent))throw new Error('provider_temporary_root_non_ascii');
  const identity=createHash('sha256').update(path.resolve(stateRoot)).digest('hex').slice(0,20);
  const directory=path.join(realpathSync(parent),`pritha-${provider}-${identity}`);
  try{mkdirSync(directory,{mode:0o700});}catch(error){if(error.code!=='EEXIST')throw error;}
  const info=lstatSync(directory);
  if(!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid!==process.getuid()))throw new Error('provider_temporary_root_invalid');
  chmodSync(directory,0o700);
  return mkdtempSync(path.join(directory,'run-'),{encoding:'utf8'});
}
