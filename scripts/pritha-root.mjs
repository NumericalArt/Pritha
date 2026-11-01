#!/usr/bin/env node
import {resolvePrithaRoot} from './lib/root-resolution.mjs';
try{
  const options={},args=process.argv.slice(2);
  for(let i=0;i<args.length;i+=2){if(!['--root','--cwd'].includes(args[i]) || !args[i+1])throw new Error('Usage: pritha-root.mjs [--root directory] [--cwd directory]');options[args[i].slice(2)]=args[i+1];}
  console.log(resolvePrithaRoot(options));
}catch(error){console.error(error.message);process.exitCode=2;}
