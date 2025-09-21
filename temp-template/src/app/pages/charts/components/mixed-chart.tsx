"use client";
import React from "react";

// widget
import { MixedChart } from "@/widgets/charts";

type Props = {};

export default function MixedChartComponent({}: Props) {
  return (
    <MixedChart
      colors={["#344767", "#e91e63"]}
      options={{
        stroke: {
          width: [0, 4],
        },
        plotOptions: {
          bar: {
            borderRadius: 4,
          },
        },
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
          type: "column",
          name: "Facebook Ads",
          data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
        },
        {
          type: "line",
          name: "Google Ads",
          data: [10, 30, 40, 120, 150, 240, 280, 250, 700],
        },
      ]}
    />
  );
}
