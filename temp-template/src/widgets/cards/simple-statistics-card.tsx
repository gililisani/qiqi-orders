"use client";
import React from "react";

// @material-tailwind/react
import { Card, Typography } from "@material-tailwind/react";
import { color } from "@material-tailwind/react/types/components/card";

type PropTypes = {
  title: string;
  value: string;
  percentage: string;
  percentageColor: color;
  percentageLabel?: string;
  refunds?: string;
};

export function SimpleStatisticsCard({
  title,
  value,
  percentage,
  percentageColor = "green",
  percentageLabel,
  refunds,
}: PropTypes) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <div className="tw-flex tw-justify-between tw-p-4">
        <div className="tw-grid tw-justify-between">
          <Typography variant="h6" className="tw-mb-1">
            {title}
          </Typography>
          <Typography variant="h5" color="blue-gray">
            {value}
          </Typography>
          <div className="tw-mt-0.5 tw-flex tw-gap-1">
            <Typography
              variant="small"
              color={percentageColor as any}
              className="!tw-font-semibold"
            >
              {percentage}
            </Typography>
            <Typography variant="small" className="!tw-font-normal">
              {percentageLabel}
            </Typography>
          </div>
        </div>
        <Typography variant="small" className="tw-text-xs !tw-font-normal">
          {refunds}
        </Typography>
      </div>
    </Card>
  );
}

export default SimpleStatisticsCard;
