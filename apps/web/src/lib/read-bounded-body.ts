export async function readBoundedBody(
  request: Request,
  maxBytes: number
): Promise<ArrayBuffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new Uint8Array(Buffer.concat(chunks)).buffer;
      size += value.byteLength;
      // Content-Length is optional and caller-controlled; count the actual bytes.
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}
