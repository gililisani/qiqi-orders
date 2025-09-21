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

export function RadarChart({
  height = 350,
  colors,
  series,
  options,
}: PropTypes) {
  const chartOptions = React.useMemo(
    () => ({
      colors,
      ...merge(
        {
          chart: {
            type: "radar",
            height: height,
            toolbar: {
              show: false,
            },
            zoom: {
              enabled: false,
            },
          },
          legend: {
            show: false,
          },
          title: {
            show: "",
          },
        },
        options ? options : {}
      ),
    }),
    [height, colors, options]
  );
  return (
    <Chart
      height={height}
      type="radar"
      series={series}
      options={chartOptions as any}
    />
  );
}

export default RadarChart;
