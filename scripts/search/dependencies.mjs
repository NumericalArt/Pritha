// Resolve the same pinned libraries for standalone host scripts and Next.
const require=process.getBuiltinModule('node:module').createRequire(new URL('../../interfaces/control-center/package.json',import.meta.url));
export const z=require('zod').z;
export const ipaddr=require('ipaddr.js');
