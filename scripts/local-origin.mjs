// The local dashboard binds to loopback, but any web page the user visits can
// still send a simple POST to it. Accept state-changing requests only from the
// dashboard's own origin; browsers always send Origin on cross-site POSTs.
export function isTrustedLocalRequest(headers, port) {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(String(headers?.host || '').toLowerCase())) return false;
  return allowed.some((host) => headers?.origin === `http://${host}`);
}
