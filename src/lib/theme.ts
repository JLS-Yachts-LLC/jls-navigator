import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "polaris.theme";

export function getStoredTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("aquila.theme");
    if (t === "light" || t === "dark") return t;
  } catch { /* ignore */ }
  return "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

/** Hook that manages the active theme + persistence. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document !== "undefined" ? getStoredTheme() : "light",
  );

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  function toggle() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return { theme, setTheme, toggle };
}
