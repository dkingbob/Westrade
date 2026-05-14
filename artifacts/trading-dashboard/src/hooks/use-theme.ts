import { useState, useEffect } from "react";

export type Theme = "dark" | "light" | "glass";

const THEMES: Theme[] = ["dark", "light", "glass"];

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem("algodesk-theme") as Theme) ?? "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light", "glass");
    root.classList.add(theme);
    localStorage.setItem("algodesk-theme", theme);
  }, [theme]);

  return { theme, setTheme: setThemeState, themes: THEMES };
}
