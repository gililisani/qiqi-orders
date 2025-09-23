"use client";

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Card({ header, footer, className = "", children, ...props }: CardProps) {
  const base = "bg-white border border-gray-200 rounded-lg shadow-sm";
  return (
    <div className={[base, className].filter(Boolean).join(" ")} {...props}>
      {header && <div className="px-4 py-3 border-b border-gray-200">{header}</div>}
      <div className="px-4 py-4">{children}</div>
      {footer && <div className="px-4 py-3 border-t border-gray-200">{footer}</div>}
    </div>
  );
}

export default Card;


