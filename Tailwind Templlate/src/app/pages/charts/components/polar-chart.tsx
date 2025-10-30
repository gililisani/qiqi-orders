"use client";

// widget
import { PolarChart } from "@/widgets/charts";

type Props = {};

export default function PolarChartComponent({}: Props) {
  return (
    <PolarChart
      height={500}
      series={[44, 55, 41, 17, 15]}
      labels={["Twitter", "Github", "YouTube", "Others", "Dribbble"]}
      colors={["#49a3f1", "#191919", "#e53a36", "#495361", "#d81b60"]}
    />
  );
}
