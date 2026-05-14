import { useState, useEffect } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeStyle = "glass" | "frosted" | "terminal" | "midnight";

// Module-level store so ALL hook instances share state and react to changes
let _mode: ThemeMode = (localStorage.getItem("wt-mode") as ThemeMode) ?? "dark";
let _style: ThemeStyle = (localStorage.getItem("wt-style") as ThemeStyle) ?? "glass";
const _listeners = new Set<() => void>();

function _apply() {
  const root = document.documentElement;
  root.classList.remove("dark", "light", "glass", "frosted", "terminal", "midnight");
  if (_mode === "light") root.classList.add("light");
  root.classList.add(_style);
  localStorage.setItem("wt-mode", _mode);
  localStorage.setItem("wt-style", _style);
  _listeners.forEach(fn => fn());
}

// Apply on module load (before first paint)
_apply();

export function useTheme() {
  const [, tick] = useState(0);

  useEffect(() => {
    const refresh = () => tick(n => n + 1);
    _listeners.add(refresh);
    return () => { _listeners.delete(refresh); };
  }, []);

  return {
    mode: _mode,
    style: _style,
    setMode: (m: ThemeMode) => { _mode = m; _apply(); },
    setStyle: (s: ThemeStyle) => { _style = s; _apply(); },
  };
}
