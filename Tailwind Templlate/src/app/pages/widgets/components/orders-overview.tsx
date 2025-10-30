"use client";

import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Timeline,
  TimelineBody,
  TimelineConnector,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { ArrowUpIcon } from "@heroicons/react/24/solid";

// data
import { ordersOverviewData } from "@/data";

type Props = {};

export default function OrdersOverview({}: Props) {
  return (
    <Card className="tw-max-w-full tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader floated={false} shadow={false} color="transparent">
        <Typography variant="h6" color="blue-gray" className="tw-mb-2">
          Orders Overview
        </Typography>
        <Typography
          variant="small"
          className="tw-flex tw-items-center tw-gap-1 !tw-font-normal !tw-text-blue-gray-600"
        >
          <ArrowUpIcon
            strokeWidth={3}
            className="tw-h-3.5 tw-w-3.5 tw-text-green-500"
          />
          <strong>24%</strong> this month
        </Typography>
      </CardHeader>
      <CardBody>
        <Timeline>
          {ordersOverviewData.map(
            ({ icon, color, title, description }, idx) => (
              <TimelineItem key={title}>
                {idx !== ordersOverviewData.length - 1 && (
                  <TimelineConnector className="!tw-scale-y-125 !tw-opacity-50" />
                )}
                <TimelineHeader>
                  <TimelineIcon className={`tw-p-2 ${color}`}>
                    {React.createElement(icon, {
                      className: "tw-w-4 tw-h-4 tw-text-white",
                    })}
                  </TimelineIcon>
                  <div className="tw-flex tw-flex-col tw-gap-1">
                    <Typography
                      variant="small"
                      color="blue-gray"
                      className="tw-block !tw-font-medium"
                    >
                      {title}
                    </Typography>
                    <Typography
                      as="span"
                      variant="small"
                      className="tw-text-xs !tw-font-medium !tw-text-blue-gray-500"
                    >
                      {description}
                    </Typography>
                  </div>
                </TimelineHeader>
                {idx !== ordersOverviewData.length - 1 && (
                  <TimelineBody>&nbsp;</TimelineBody>
                )}
              </TimelineItem>
            )
          )}
        </Timeline>
      </CardBody>
    </Card>
  );
}
