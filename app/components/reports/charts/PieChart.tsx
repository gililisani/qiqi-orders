"use client";
import React from "react";
import Chart from "react-apexcharts";
import merge from "deepmerge";

type PieChartProps = {
  height?: number;
  series: number[];
  colors?: string | string[];
  labels?: string[];
  options?: {};
};

export function PieChart({
  height = 350,
  series,
  colors,
  labels,
  options,
}: PieChartProps) {
  const chartOptions = React.useMemo(
    () => ({
      colors,
      labels,
      ...merge(
        {
          chart: {
            type: "donut",
            height: height,
            toolbar: {
              show: false,
            },
            zoom: {
              enabled: false,
            },
          },
          dataLabels: {
            enabled: false,
          },
          legend: {
            show: false,
          },
        },
        options ? options : {}
      ),
    }),
    [height, colors, labels, options]
  );
  return (
    <Chart
      height={height}
      type="pie"
      series={series}
      options={chartOptions as any}
    />
  );
}

export default PieChart;

