"use client";
// widgets
import { AreaChart } from "@/widgets/charts";

type Props = {};

export default function AreaChartComponent({}: Props) {
  return (
    <AreaChart
      colors={["#344767", "#e91e63"]}
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
          name: "Iphone",
          data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
        },
        {
          name: "Addroid",
          data: [10, 30, 40, 120, 150, 240, 280, 250, 280],
        },
      ]}
    />
  );
}
