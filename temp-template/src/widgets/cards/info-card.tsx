"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
} from "@material-tailwind/react";

import { color } from "@material-tailwind/react/types/components/card";

type PropTypes = {
  icon: any;
  title: React.ReactNode;
  description: React.ReactNode;
  value: string;
  color?: color;
};

export function InfoCard({
  icon,
  title,
  description,
  value,
  color = "gray",
}: PropTypes) {
  return (
    <Card className="tw-w-full tw-items-center tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        className="tw-grid tw-h-16 tw-w-16 tw-place-items-center tw-overflow-visible"
        variant="gradient"
        color={color}
      >
        {React.createElement(icon, {
          className: "tw-w-6 tw-h-6 tw-text-white",
        })}
      </CardHeader>
      <CardBody className="tw-text-center tw-pt-4">
        <Typography className="tw-mb-2 !tw-font-bold" color="blue-gray">
          {title}
        </Typography>
        <Typography className="tw-mb-4 tw-text-xs !tw-font-normal !tw-text-blue-gray-500 ">
          {description}
        </Typography>
        <Typography
          className="tw-border-t tw-border-t-blue-gray-50 tw-pt-4 tw-text-xl !tw-font-bold"
          color="blue-gray"
        >
          {value}
        </Typography>
      </CardBody>
    </Card>
  );
}

export default InfoCard;
