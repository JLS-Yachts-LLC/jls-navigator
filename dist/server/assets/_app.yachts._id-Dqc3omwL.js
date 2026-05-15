import { c as createServerRpc } from "./createServerRpc-Bmmu-PDs.js";
import { a0 as createServerFn } from "./worker-entry-BHx6HRFD.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const doPushToSharePoint_createServerFn_handler = createServerRpc({
  id: "432fa786ec9d39c6e42011ba59f77b0dd10361a199e99f1ca0b0bb246ebbc058",
  name: "doPushToSharePoint",
  filename: "src/routes/_app.yachts.$id.tsx"
}, (opts) => doPushToSharePoint.__executeServer(opts));
const doPushToSharePoint = createServerFn({
  method: "POST"
}).handler(doPushToSharePoint_createServerFn_handler, async (ctx) => {
  try {
    const {
      pushYachtToSharePoint
    } = await import("./worker-entry-BHx6HRFD.js").then((n) => n.af);
    await pushYachtToSharePoint(ctx.data.yachtId);
  } catch {
  }
});
export {
  doPushToSharePoint_createServerFn_handler
};
