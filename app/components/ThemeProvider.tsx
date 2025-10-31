"use client";

import { ThemeProvider } from "@material-tailwind/react";
import { MaterialTailwindControllerProvider } from "../context";
import theme from "../theme";

export default function MaterialThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider value={theme}>
      <MaterialTailwindControllerProvider>
        {children}
      </MaterialTailwindControllerProvider>
    </ThemeProvider>
  );
}
