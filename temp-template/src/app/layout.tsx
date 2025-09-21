"use client";

/* eslint-disable @next/next/next-script-for-ga */
import React from "react";
import Script from "next/script";
import { Roboto } from "next/font/google";
import ThemeProvider from "@/components/ThemeProvider";
import theme from "@/theme";
import { MaterialTailwindControllerProvider } from "@/context";
import InnerContent from "./content";

import "react-calendar/dist/Calendar.css";
import "./globals.css";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script
          defer
          data-site="YOUR_DOMAIN_HERE"
          src="https://api.nepcha.com/js/nepcha-analytics.js"
        />
        <link rel="icon" type="image/svg+xml" href="/img/favicon.png" />
        <title>
          Material Tailwind Dashboard NextJS PRO: Premium Tailwind CSS and
          NextJS Admin Template
        </title>
      </head>
      <body className={roboto.className}>
        <ThemeProvider value={theme}>
          <MaterialTailwindControllerProvider>
            <InnerContent>{children}</InnerContent>
          </MaterialTailwindControllerProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
