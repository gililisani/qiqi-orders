"use client";
import React from "react";

// react-apexcharts
import Chart from "react-apexcharts";

// deepmerge
import merge from "deepmerge";

type PropTypes = {
  height?: number;
  series: { name?: string; data: number[] }[];
  colors?: string | string[];
  options?: {};
};

export function LineChart({
  height = 350,
  series,
  colors,
  options,
}: PropTypes) {
  const chartOptions = React.useMemo(
    () => ({
      colors,
      ...merge(
        {
          chart: {
            height: height,
            type: "line",
            zoom: {
              enabled: false,
            },
            toolbar: {
              show: false,
            },
          },
          title: {
            show: "",
          },
          dataLabels: {
            enabled: false,
          },
          legend: {
            show: false,
          },
          markers: {
            size: 5,
            strokeWidth: 0,
            strokeColors: "transparent",
            hover: {
              size: 7,
            },
          },
          stroke: {
            curve: "straight",
            width: 4,
          },
          grid: {
            show: true,
            borderColor: "#e7e7e7",
            strokeDashArray: 5,
            xaxis: {
              lines: {
                show: true,
              },
            },
            padding: {
              top: 5,
              right: 20,
            },
          },
          tooltip: {
            theme: "dark",
          },
          yaxis: {
            labels: {
              style: {
                colors: "#9ca2b7",
                fontSize: "13px",
                fontFamily: "inherit",
                fontWeight: 300,
              },
            },
          },
          xaxis: {
            axisTicks: {
              show: false,
            },
            axisBorder: {
              show: false,
            },
            labels: {
              style: {
                colors: "#9ca2b7",
                fontSize: "13px",
                fontFamily: "inherit",
                fontWeight: 300,
              },
            },
          },
        },
        options ? options : {}
      ),
    }),
    [height, colors, options]
  );

  return (
    <Chart
      type="line"
      height={height}
      series={series}
      options={chartOptions as any}
    />
  );
}

export default LineChart;
