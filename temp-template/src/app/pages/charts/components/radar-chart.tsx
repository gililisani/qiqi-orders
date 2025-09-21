"use client";
import React from "react";

// widget
import { RadarChart } from "@/widgets/charts";

type Props = {};

export default function RadarChartComponent({}: Props) {
  return (
    <RadarChart
      height={500}
      colors={["#344767"]}
      series={[
        {
          name: "Sales",
          data: [80, 50, 30, 40, 100, 20],
        },
      ]}
      options={{
        xaxis: {
          categories: ["January", "February", "March", "April", "May", "June"],
        },
      }}
    />
  );
}
