import { U as jsxRuntimeExports } from "./worker-entry-C9aPYFNG.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const SplitErrorComponent = ({
  error
}) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-8 max-w-xl", children: [
  /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-semibold text-destructive mb-2", children: "Settings failed to load" }),
  /* @__PURE__ */ jsxRuntimeExports.jsx("pre", { className: "rounded-lg bg-muted p-4 text-xs overflow-auto whitespace-pre-wrap text-muted-foreground", children: error instanceof Error ? error.message : String(error) })
] });
export {
  SplitErrorComponent as errorComponent
};
