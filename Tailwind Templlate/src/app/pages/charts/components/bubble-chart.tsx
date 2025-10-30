"use client";
// widget
import { BubbleChart } from "@/widgets/charts";

// data
import { generateFakeData } from "@/utils";

type Props = {};

export default function BubbleChartComponent({}: Props) {
  return (
    <BubbleChart
      colors={["#344767", "#344767", "#e91e63"]}
      series={[
        {
          name: "US",
          data: generateFakeData(new Date("11 Feb 2023 GMT").getTime(), 20, {
            min: 10,
            max: 60,
          }) as any,
        },
        {
          name: "EU",
          data: generateFakeData(new Date("11 Feb 2023 GMT").getTime(), 20, {
            min: 10,
            max: 60,
          }),
        },
        {
          name: "Asian",
          data: generateFakeData(new Date("11 Feb 2023 GMT").getTime(), 20, {
            min: 10,
            max: 60,
          }),
        },
      ]}
    />
  );
}
