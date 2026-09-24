import { useMutation } from "@tanstack/react-query";
import { ackAlarm } from "../../api/client";

/**
 * Acknowledge one or more alarms. The API audits each ack; the runtime socket then pushes the
 * new acked state, so the UI never flips state optimistically.
 */
export function useAckAlarms() {
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(ids.map((id) => ackAlarm(id)));
      const failed = results
        .map((r, i) => (r.status === "rejected" ? { id: ids[i]!, error: r.reason as unknown } : null))
        .filter((x): x is { id: string; error: unknown } => x !== null);
      if (failed.length) {
        const first = failed[0]!.error as { body?: { message?: string; fix?: string } };
        const err = new Error(`${failed.length} of ${ids.length} acknowledgements failed`) as Error & {
          body?: { message: string; fix?: string };
        };
        err.body = {
          message: `${failed.length} of ${ids.length} acknowledgements failed: ${first.body?.message ?? "request error"}`,
          ...(first.body?.fix ? { fix: first.body.fix } : { fix: "Refresh the list and retry; only active alarms can be acknowledged." }),
        };
        throw err;
      }
      return ids;
    },
  });
}
