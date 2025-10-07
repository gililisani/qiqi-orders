"use client";

import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function Card({ header, footer, className = "", children, ...props }: CardProps) {
  const base = "bg-white border border-[#e5e5e5] rounded-xl shadow-none";
  return (
    <div className={[base, className].filter(Boolean).join(" ")} {...props}>
      {header && <div className="px-6 py-4 border-b border-[#e5e5e5]">{header}</div>}
      <div className="px-6 py-5">{children}</div>
      {footer && <div className="px-6 py-4 border-t border-[#e5e5e5]">{footer}</div>}
    </div>
  );
}

export default Card;


