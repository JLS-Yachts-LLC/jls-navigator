import { c as createServerRpc } from "./createServerRpc-Dfg1dEJf.js";
import { a0 as createServerFn } from "./worker-entry-DhepChOA.js";
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
    } = await import("./worker-entry-DhepChOA.js").then((n) => n.ag);
    await pushYachtToSharePoint(ctx.data.yachtId);
  } catch {
  }
});
const doSyncImage_createServerFn_handler = createServerRpc({
  id: "94dfc16e6e51f6ad6c23321af55986f4d33e0288af6ed5c83f574635146bfe6d",
  name: "doSyncImage",
  filename: "src/routes/_app.yachts.$id.tsx"
}, (opts) => doSyncImage.__executeServer(opts));
const doSyncImage = createServerFn({
  method: "POST"
}).handler(doSyncImage_createServerFn_handler, async (ctx) => {
  try {
    const {
      downloadYachtImage
    } = await import("./worker-entry-DhepChOA.js").then((n) => n.ag);
    return await downloadYachtImage(ctx.data.yachtId);
  } catch (e) {
    return {
      url: null,
      reason: e instanceof Error ? e.message : "Unexpected error during sync."
    };
  }
});
export {
  doPushToSharePoint_createServerFn_handler,
  doSyncImage_createServerFn_handler
};
