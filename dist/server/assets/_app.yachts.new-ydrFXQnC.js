import { c as createServerRpc } from "./createServerRpc-Bmeu1wp5.js";
import { a0 as createServerFn } from "./worker-entry-CjcILNT2.js";
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
    } = await import("./worker-entry-CjcILNT2.js").then((n) => n.ag);
    await pushYachtToSharePoint(ctx.data.yachtId);
  } catch {
  }
});
const doCreateSpFolder_createServerFn_handler = createServerRpc({
  id: "bce3ee10f55a91e455657d07dd88487be9d6c6d103d7ed1ae7d45335102e80bf",
  name: "doCreateSpFolder",
  filename: "src/routes/_app.yachts.new.tsx"
}, (opts) => doCreateSpFolder.__executeServer(opts));
const doCreateSpFolder = createServerFn({
  method: "POST"
}).handler(doCreateSpFolder_createServerFn_handler, async (ctx) => {
  try {
    const {
      createYachtFolderInSharePoint
    } = await import("./worker-entry-CjcILNT2.js").then((n) => n.ag);
    const {
      supabaseAdmin
    } = await import("./worker-entry-CjcILNT2.js").then((n) => n.af);
    const folderUrl = await createYachtFolderInSharePoint(ctx.data.vesselName);
    if (folderUrl) {
      await supabaseAdmin.from("yachts").update({
        link_to_folder: folderUrl
      }).eq("id", ctx.data.yachtId);
    }
  } catch {
  }
});
export {
  doCreateSpFolder_createServerFn_handler,
  doPushToSharePoint_createServerFn_handler
};
