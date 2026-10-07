import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function productDirectory(store: string, handle: string): string {
  const safe = createHash("sha256").update(handle).digest("hex").slice(0, 12);
  return join(tmpdir(), "baby-cli", store, safe);
}

export async function atomicWrite(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try { await writeFile(temporary, data); await rename(temporary, path); }
  finally { await unlink(temporary).catch(() => undefined); }
}
