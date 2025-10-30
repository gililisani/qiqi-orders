import React from "react";

// react-apexcharts
import Chart from "react-apexcharts";

// deepmerge
import merge from "deepmerge";

type PropTypes = {
  height?: number;
  series: number[];
  colors?: string | string[];
  labels?: string[];
  options?: {};
};

export function PolarChart({
  height = 350,
  colors,
  labels,
  series,
  options,
}: PropTypes) {
  const chartOptions = React.useMemo(
    () => ({
      colors,
      labels,
      ...merge(
        {
          chart: {
            type: "polarArea",
            height: height,
            toolbar: {
              show: false,
            },
            zoom: {
              enabled: false,
            },
          },
          stroke: {
            colors: ["#fff"],
          },
          fill: {
            opacity: 1,
          },
          legend: {
            show: false,
          },
        },
        options ? options : {}
      ),
    }),
    [colors, labels, height, options]
  );
  return (
    <Chart
      height={height}
      type="polarArea"
      options={chartOptions as any}
      series={series}
    />
  );
}

export default PolarChart;
