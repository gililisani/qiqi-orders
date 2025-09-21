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

export function DoughnutChart({
  height = 350,
  series,
  colors,
  labels,
  options,
}: PropTypes) {
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
          responsive: [
            {
              breakpoint: 480,
              options: {
                chart: {
                  width: 200,
                },
              },
            },
          ],
        },
        options ? options : {}
      ),
    }),
    [height, colors, labels, options]
  );

  return (
    <Chart
      height={height}
      type="donut"
      series={series}
      options={chartOptions as any}
    />
  );
}

export default DoughnutChart;
