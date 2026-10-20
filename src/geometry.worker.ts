// Intent: Keep exact substitution expansion off the UI thread; terminating the worker cancels stale work.
import {
  generatePatch,
  type GeometryOptions,
  type WorkerReply,
} from "./tiling";
self.onmessage = (event: MessageEvent<GeometryOptions>) => {
  let reply: WorkerReply;
  try {
    reply = { ok: true, patch: generatePatch(event.data) };
  } catch (error) {
    reply = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  self.postMessage(reply);
};
