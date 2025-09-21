"use client";

import { ThemeProvider } from "@material-tailwind/react";
import customTheme from "../theme";
import { MaterialTailwindControllerProvider } from "../context";

export default function MaterialThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider value={customTheme}>
      <MaterialTailwindControllerProvider>
        {children}
      </MaterialTailwindControllerProvider>
    </ThemeProvider>
  );
}
