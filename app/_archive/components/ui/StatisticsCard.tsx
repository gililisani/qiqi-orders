"use client";

import React from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
} from "@material-tailwind/react";
import { color } from "@material-tailwind/react/types/components/card";

type PropTypes = {
  color?: color;
  icon: React.ReactNode;
  title: React.ReactNode;
  value: React.ReactNode;
  footer?: React.ReactNode;
};

export function StatisticsCard({
  color = "gray",
  icon,
  title,
  value,
  footer = null,
}: PropTypes) {
  return (
    <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
      <div className="flex justify-between">
        <CardHeader
          variant="gradient"
          color={color}
          floated={false}
          shadow={false}
          className="absolute !grid h-12 w-12 place-items-center"
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          {icon}
        </CardHeader>
        <CardBody className="!p-4 text-right" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
          <Typography
            variant="small"
            className="!font-normal text-blue-gray-600"
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            {title}
          </Typography>
          <Typography variant="h4" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            {value}
          </Typography>
        </CardBody>
      </div>
      {footer && (
        <CardFooter className="border-t border-blue-gray-50 !p-4" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

export default StatisticsCard;

