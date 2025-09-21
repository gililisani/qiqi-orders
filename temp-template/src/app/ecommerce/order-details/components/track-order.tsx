"use client";

// @material-tailwind/react
import {
  Timeline,
  TimelineBody,
  TimelineConnector,
  TimelineHeader,
  TimelineIcon,
  TimelineItem,
  Typography,
} from "@material-tailwind/react";
import React from "react";

// @heroicons/react
import {
  BellIcon,
  PlusCircleIcon,
  ShoppingCartIcon,
  CheckIcon,
} from "@heroicons/react/24/solid";

type Props = {};

// Orders Overview Data
const ORDERS_OVERVIEW_DATA = [
  {
    icon: BellIcon,
    bgColor: "bg-gray-900",
    title: "Order received",
    description: "22 DEC 7:20 PM",
  },
  {
    icon: PlusCircleIcon,
    bgColor: "bg-gray-900",
    title: "Generate order id #1832412",
    description: "22 DEC 7:21 AM",
  },
  {
    icon: ShoppingCartIcon,
    bgColor: "bg-gray-900",
    title: "Order transmited to courier",
    description: "22 DEC 8:10 AM",
  },
  {
    icon: CheckIcon,
    bgColor: "bg-green-500",
    title: "Order delivered",
    description: "22 DEC 4:54 PM",
  },
];
export default function TrackOrder({}: Props) {
  return (
    <div className="col-span-1">
      <Typography variant="h6" color="blue-gray" className="tw-mb-4">
        Track order
      </Typography>
      <div>
        <Timeline>
          {ORDERS_OVERVIEW_DATA.map(
            ({ icon, bgColor, title, description }, idx) => (
              <TimelineItem key={title}>
                {idx !== ORDERS_OVERVIEW_DATA.length - 1 && (
                  <TimelineConnector className="tw-scale-y-150 !tw-opacity-50" />
                )}
                <TimelineHeader>
                  <TimelineIcon className={`tw-p-2 ${bgColor}`}>
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
                {idx !== ORDERS_OVERVIEW_DATA.length - 1 && (
                  <TimelineBody>&nbsp;</TimelineBody>
                )}
              </TimelineItem>
            )
          )}
        </Timeline>
      </div>
    </div>
  );
}
