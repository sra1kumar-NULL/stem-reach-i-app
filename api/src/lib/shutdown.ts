/** Graceful shutdown: stop accepting, close the server and the pool, exit 0 — with a hard timeout. */
export interface ShutdownDeps {
  closeServer: () => Promise<void>;
  closePool: () => Promise<void>;
  logger: Pick<Console, "log" | "error">;
  exit?: (code: number) => void;
  timeoutMs?: number;
  signals?: NodeJS.Signals[];
  /** Process-like emitter (tests). */
  proc?: Pick<NodeJS.Process, "once">;
}

export function shutdownOnSignals(deps: ShutdownDeps): (signal: string) => Promise<void> {
  const exit = deps.exit ?? ((code: number) => process.exit(code));
  const timeoutMs = deps.timeoutMs ?? 10_000;
  let started = false;
  const run = async (signal: string) => {
    if (started) return;
    started = true;
    deps.logger.log(`${signal} received: shutting down`);
    const hard = setTimeout(() => {
      deps.logger.error(`shutdown did not finish in ${timeoutMs} ms: forcing exit`);
      exit(1);
    }, timeoutMs);
    try {
      await deps.closeServer();
      await deps.closePool();
      clearTimeout(hard);
      exit(0);
    } catch (err) {
      clearTimeout(hard);
      deps.logger.error("error during shutdown", err);
      exit(1);
    }
  };
  const proc = deps.proc ?? process;
  for (const sig of deps.signals ?? (["SIGTERM", "SIGINT"] as NodeJS.Signals[])) proc.once(sig, () => void run(sig));
  return run;
}
