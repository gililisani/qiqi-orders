"use client";

import React from "react";

// widget
import { LineChart } from "@/widgets/charts";

type Props = {};

export default function LineChartComponent({}: Props) {
  return (
    <LineChart
      colors={["#344767", "#344767", "#e91e63"]}
      options={{
        xaxis: {
          categories: [
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ],
        },
      }}
      series={[
        {
          name: "Facebook Ads",
          data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
        },
        {
          name: "Google Ads",
          data: [10, 30, 40, 120, 150, 240, 280, 250, 280],
        },
        {
          name: "Google Ads",
          data: [40, 50, 60, 180, 190, 200, 220, 290, 400],
        },
      ]}
    />
  );
}
