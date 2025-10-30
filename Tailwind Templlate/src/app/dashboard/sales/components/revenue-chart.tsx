"use client";

import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Tooltip,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

// widgets
import { LineChart } from "@/widgets/charts";

type Props = {};

export default function RevenueChart({}: Props) {
  return (
    <div className="tw-col-span-2">
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardHeader
          floated={false}
          shadow={false}
          className="tw-flex tw-justify-between tw-gap-8 tw-overflow-visible"
        >
          <div>
            <Typography variant="h6" color="blue-gray">
              Revenue
            </Typography>
            <div className="tw-mt-2 tw-flex tw-items-center tw-gap-8">
              <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-h-2 tw-w-2 tw-rounded-full tw-bg-blue-600" />
                <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                  Facebook Ads
                </Typography>
              </div>
              <div className="tw-flex tw-items-center tw-gap-2">
                <span className="tw-h-2 tw-w-2 tw-rounded-full tw-bg-blue-gray-700" />
                <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                  Google Ads
                </Typography>
              </div>
            </div>
          </div>
          <Tooltip content="See which ads perform better" placement="left">
            <ExclamationCircleIcon
              strokeWidth={1}
              className="tw-w-8 tw-h-8 !tw-text-blue-gray-600"
            />
          </Tooltip>
        </CardHeader>
        <CardBody className="tw-p-0">
          {/** Line Chart */}
          <LineChart
            colors={["#1874e9", "#344767", "#e91e63"]}
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
                name: "Facebook Ads",
                data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
              },
              {
                name: "Google Ads",
                data: [10, 30, 40, 120, 150, 240, 280, 250, 280],
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
