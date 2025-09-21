"use client";
import React from "react";

// widgets
import { SimpleStatisticsCard } from "@/widgets/cards";

// data
import { salesData } from "@/data";

type Props = {};

export default function SalesCard({}: Props) {
  return (
    <div className="tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-3">
      {/** Simple Statistics Card */}
      {salesData.map((props, key) => (
        <SimpleStatisticsCard key={key} {...props} />
      ))}
    </div>
  );
}
