"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardFooter,
  CardHeader,
  Typography,
} from "@material-tailwind/react";

// widgets
import { AreaChart } from "@/widgets/charts";

type Props = {};

export default function CaloriesChart({}: Props) {
  return (
    <Card className="tw-max-w-md tw-h-max !tw-overflow-hidden lg:tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader floated={false} shadow={false} color="transparent">
        <Typography
          variant="small"
          className="!tw-font-semibold !tw-text-blue-gray-500"
        >
          Calories
        </Typography>
        <div className="tw-flex tw-gap-2">
          <Typography className="tw-text-2xl !tw-font-bold" color="blue-gray">
            97
          </Typography>
          <Typography
            variant="small"
            className="tw-mt-2 !tw-font-bold tw-text-green-500"
          >
            +5%
          </Typography>
        </div>
      </CardHeader>
      <CardFooter className="!tw-p-0 tw-scale-100 -tw-translate-y-0.5">
        <AreaChart
          height={100}
          colors={["#344767"]}
          series={[
            {
              name: "Calories",
              data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
            },
          ]}
          options={{
            grid: {
              show: false,
              padding: {
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              },
            },
            chart: {
              parentHeightOffset: 0,
            },
            yaxis: { show: false },
            xaxis: { labels: { show: false, maxHeight: 0 } },
          }}
        />
      </CardFooter>
    </Card>
  );
}
