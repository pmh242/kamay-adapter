export function generateRequestId() {
  const timestamp = Date.now().toString(36);
  const segment = crypto.randomUUID().split("-")[0];
  return `kmy_${timestamp}_${segment}`;
}
