"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Progress,
  Typography,
} from "@material-tailwind/react";

// widgets
import { LineChart } from "@/widgets/charts";

// @heroicons/react
import { CalendarIcon } from "@heroicons/react/24/solid";

type Props = {};

export default function TaskChart({}: Props) {
  return (
    <div className="tw-mb-6 md:tw-col-span-1 lg:tw-col-span-2">
      {/* Line Chart */}
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <div className="!tw-flex !tw-flex-row tw-items-center tw-justify-between">
          <div className="!tw-flex tw-items-end">
            <CardHeader
              floated={false}
              shadow={false}
              className="tw-absolute tw-grid tw-h-12 tw-w-12 tw-place-items-center tw-overflow-visible"
              variant="gradient"
              color="gray"
            >
              <CalendarIcon className="tw-h-5 tw-w-5 tw-text-white" />
            </CardHeader>
            <div>
              <Typography variant="small" className="!tw-font-normal">
                Tasks
              </Typography>
              <Typography variant="h5" color="blue-gray">
                480
              </Typography>
            </div>
          </div>
          <div>
            <Typography className="tw-mb-1 tw-block tw-text-xs !tw-font-medium">
              60%
            </Typography>
            <Progress
              value={60}
              size="sm"
              color="gray"
              className="!tw-w-60 tw-mr-4"
            />
          </div>
        </div>
        <CardBody className="tw-mt-4 !tw-p-0">
          <LineChart
            height={205}
            colors={["#344767", "#344767", "#e91e63"]}
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
                name: "Tasks",
                data: [50, 100, 200, 190, 400, 350, 500, 450, 700],
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}
