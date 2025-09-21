"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
} from "@material-tailwind/react";

// widgets
import { HorizontalBarChart } from "@/widgets/charts";
type Props = {};

export default function SalesByAge({}: Props) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        className="tw-flex tw-justify-between tw-gap-8 tw-overflow-visible"
      >
        <Typography variant="h6" color="blue-gray">
          Sales by age
        </Typography>
      </CardHeader>
      <CardBody className="!tw-p-0">
        <HorizontalBarChart
          height={295}
          colors="#344868"
          options={{
            xaxis: {
              categories: ["16-20", "21-25", "26-30", "31-36", "36-42", "42+"],
            },
          }}
          series={[
            {
              name: "Sales",
              data: [10, 20, 30, 40, 50, 60],
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}
