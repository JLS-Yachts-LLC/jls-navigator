import { U as jsxRuntimeExports } from "./worker-entry-BSYsl9bp.js";
import { c as cn } from "./utils-Bz4m9VPB.js";
const STATUS_MAP = {
  active: "pill-success",
  "in port": "pill-success",
  arriving: "pill-info",
  departed: "pill-muted",
  pending: "pill-warning",
  archived: "pill-muted",
  "in progress": "pill-info",
  done: "pill-success",
  paid: "pill-info",
  expired: "pill-danger",
  urgent: "pill-danger",
  high: "pill-warning"
};
function StatusPill({ status, className }) {
  if (!status) return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "pill pill-muted", children: "—" });
  const key = status.toLowerCase().trim();
  const variant = STATUS_MAP[key] ?? "pill-muted";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("pill", variant, className), children: status });
}
export {
  StatusPill as S
};
