/**
 * Stand-in for the `cloudflare:workers` runtime module so code that imports
 * @cloudflare/workers-oauth-provider can run under Node in vitest. The
 * provider only uses WorkerEntrypoint for an `instanceof` check.
 */
export class WorkerEntrypoint {}
