import { c as createServerRpc } from "./createServerRpc-DB_F03cw.js";
import { a0 as createServerFn } from "./worker-entry-C9aPYFNG.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const doPushToSharePoint_createServerFn_handler = createServerRpc({
  id: "72410b0d758223d6843af93760837cbe41f7f4a32b5ec4f15aed33a3ead26a73",
  name: "doPushToSharePoint",
  filename: "src/routes/_app.yachts.new.tsx"
}, (opts) => doPushToSharePoint.__executeServer(opts));
const doPushToSharePoint = createServerFn({
  method: "POST"
}).handler(doPushToSharePoint_createServerFn_handler, async (ctx) => {
  try {
    const {
      pushYachtToSharePoint
    } = await import("./worker-entry-C9aPYFNG.js").then((n) => n.af);
    await pushYachtToSharePoint(ctx.data.yachtId);
  } catch {
  }
});
export {
  doPushToSharePoint_createServerFn_handler
};
