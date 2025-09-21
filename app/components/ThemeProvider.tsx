"use client";

import { ThemeProvider } from "@material-tailwind/react";
import { MaterialTailwindControllerProvider } from "../context";

export default function MaterialThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <MaterialTailwindControllerProvider>
        {children}
      </MaterialTailwindControllerProvider>
    </ThemeProvider>
  );
}
