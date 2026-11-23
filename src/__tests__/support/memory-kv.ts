/**
 * Minimal in-memory KVNamespace covering the calls workers-oauth-provider
 * makes (get/put/delete/list). Expiration is ignored.
 */
interface Entry {
  value: string;
  metadata?: unknown;
}

export class MemoryKV {
  readonly entries = new Map<string, Entry>();

  async get(key: string, options?: string | { type?: string }): Promise<unknown> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const type = typeof options === 'string' ? options : options?.type;
    return type === 'json' ? JSON.parse(entry.value) : entry.value;
  }

  async put(key: string, value: string, options?: { metadata?: unknown }): Promise<void> {
    this.entries.set(key, { value, metadata: options?.metadata });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  async list(options: { prefix?: string } = {}) {
    const keys = [...this.entries.entries()]
      .filter(([name]) => name.startsWith(options.prefix ?? ''))
      .map(([name, entry]) => ({ name, metadata: entry.metadata }));
    return { keys, list_complete: true, cacheStatus: null };
  }
}
