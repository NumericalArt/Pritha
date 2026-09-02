const leases = new Map<string, string>();

export function nativeThreadLeaseKey(providerId: string, threadId: string) {
  return `${providerId}:${threadId}`;
}

export function tryAcquireNativeThreadTurn(key: string, owner: string) {
  if (leases.has(key)) return null;
  leases.set(key, owner);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (leases.get(key) === owner) leases.delete(key);
  };
}
