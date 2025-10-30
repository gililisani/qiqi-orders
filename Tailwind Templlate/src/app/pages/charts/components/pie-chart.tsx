"use client";
import React from "react";

// widget
import { PieChart } from "@/widgets/charts";

type Props = {};

export default function PieChartComponent({}: Props) {
  return (
    <PieChart
      series={[25, 20, 15, 60, 25]}
      labels={["Twitter", "Github", "YouTube", "Others", "Dribbble"]}
      colors={["#49a3f1", "#191919", "#e53a36", "#495361", "#d81b60"]}
    />
  );
}
