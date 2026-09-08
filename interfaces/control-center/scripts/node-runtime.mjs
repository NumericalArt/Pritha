export function requireControlCenterNode(version=process.versions.node) {
  const [major,minor]=version.split('.').map(Number);
  if(major<22 || (major===22 && minor<13))throw new Error('Pritha Control Center requires Node.js 22.13 or newer for durable task coordination. Use the configured Node runtime before building or starting this release.');
}
requireControlCenterNode();
