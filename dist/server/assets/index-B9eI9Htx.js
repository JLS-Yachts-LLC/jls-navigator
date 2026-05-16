import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-D7ynLlqD.js";
import { u as useAuth, a as useNavigate } from "./router-DOVXXrXT.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
function Index() {
  const {
    user,
    loading
  } = useAuth();
  const navigate = useNavigate();
  reactExports.useEffect(() => {
    if (loading) return;
    navigate({
      to: user ? "/yachts" : "/auth"
    });
  }, [loading, user, navigate]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-screen items-center justify-center bg-background", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" }) });
}
export {
  Index as component
};
