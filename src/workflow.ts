import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { rebuildHistory } from "./history";
import { ingestLifecycle, ingestSource, recordFailure } from "./ingest";
import { LIFECYCLE_SOURCES, SOURCES } from "./sources";
import { rebuildSnapshot } from "./snapshot";

const SOURCE_STEP = { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "2 minutes" } as const;

/**
 * One full scan. Every source is its own step, so each gets its own CPU budget
 * (10 ms on Workers Free) and retries, and one bad source cannot stop the others.
 */
export class CatchupRun extends WorkflowEntrypoint<Env> {
  override async run(event: WorkflowEvent<unknown>, step: WorkflowStep): Promise<{ ok: number; failed: string[] }> {
    const now = event.timestamp.getTime();
    const failed: string[] = [];

    for (const source of SOURCES) {
      try {
        await step.do(`ingest ${source.id}`, SOURCE_STEP, () => ingestSource(this.env, source, now));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failed.push(source.id);
        await step.do(`record failure ${source.id}`, () => recordFailure(this.env, source, now, message));
      }
    }

    for (const source of LIFECYCLE_SOURCES) {
      try {
        await step.do(`lifecycle ${source.id}`, SOURCE_STEP, () => ingestLifecycle(this.env, source, now));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failed.push(source.id);
        await step.do(`record failure ${source.id}`, () => recordFailure(this.env, source, now, message));
      }
    }

    await step.do("snapshot", () => rebuildSnapshot(this.env, now));
    await step.do("history", () => rebuildHistory(this.env, now));
    return { ok: SOURCES.length - failed.length, failed };
  }
}
