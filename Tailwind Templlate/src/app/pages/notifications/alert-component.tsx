"use client";
import React from "react";

// @material-tailwind/react
import { Alert } from "@material-tailwind/react";
import { color } from "@material-tailwind/react/types/components/card";

type Props = {
  color: color;
};

export default function AlertComponent({ color }: Props) {
  const [showAlerts, setShowAlerts] = React.useState<Record<string, boolean>>({
    pink: true,
    gray: true,
    blue: true,
    green: true,
    orange: true,
    red: true,
  });
  return (
    <Alert
      key={color}
      open={showAlerts[color]}
      color={color as any}
      onClose={() =>
        setShowAlerts((current) => ({ ...current, [color]: false }))
      }
    >
      A simple {color} alert with an <a href="#">example link</a>. Give it a
      click if you like.
    </Alert>
  );
}
