import { U as jsxRuntimeExports, a2 as createServerFn } from "./worker-entry-BhSB73Oa.js";
import { c as createSsrRpc } from "./router-DtI2KWt0.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
createServerFn({
  method: "POST"
}).handler(createSsrRpc("5def584ad8cd342e9ac57d676716005d1e7dd545c8c7c727ed9d14e14651fd23"));
const SplitErrorComponent = ({
  error
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-8 max-w-xl", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-destructive mb-2", children: "Settings failed to load" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "rounded-lg bg-muted p-4 text-xs overflow-auto whitespace-pre-wrap text-muted-foreground", children: error instanceof Error ? error.message : String(error) })
] });
export {
  SplitErrorComponent as errorComponent
};
