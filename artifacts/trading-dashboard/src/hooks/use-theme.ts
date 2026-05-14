import { useState, useEffect } from "react";

export type ThemeMode = "dark" | "light";
export type ThemeStyle = "glass" | "frosted" | "terminal" | "midnight";

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(() =>
    (localStorage.getItem("wt-mode") as ThemeMode) ?? "dark"
  );
  const [style, setStyle] = useState<ThemeStyle>(() =>
    (localStorage.getItem("wt-style") as ThemeStyle) ?? "glass"
  );

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light", "glass", "frosted", "terminal", "midnight");
    if (mode === "light") root.classList.add("light");
    root.classList.add(style);
    localStorage.setItem("wt-mode", mode);
    localStorage.setItem("wt-style", style);
  }, [mode, style]);

  return { mode, style, setMode, setStyle };
}
