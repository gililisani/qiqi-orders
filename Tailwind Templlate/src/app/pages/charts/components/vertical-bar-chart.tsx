"use client";

import React from "react";

// widgets
import { VerticalBarChart } from "@/widgets/charts";

type Props = {};

export default function VerticalBarChartComponent({}: Props) {
  return (
    <VerticalBarChart
      colors="#344767"
      options={{
        xaxis: {
          categories: ["16-20", "21-25", "26-30", "31-36", "36-42", "42+"],
        },
      }}
      series={[
        {
          name: "Sales",
          data: [10, 20, 30, 40, 50, 60],
        },
      ]}
    />
  );
}
