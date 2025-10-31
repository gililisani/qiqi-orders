"use client";

import React from "react";

// @material-tailwind/react
import { Card, Typography } from "@material-tailwind/react";

type PropTypes = {
  title: string;
  value: string | number;
  description?: string;
};

export function SimpleStatisticsCard({
  title,
  value,
  description,
}: PropTypes) {
  return (
    <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
      <div className="flex justify-between p-4">
        <div className="grid justify-between">
          <Typography variant="h6" className="mb-1" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            {title}
          </Typography>
          <Typography variant="h5" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            {value}
          </Typography>
          {description && (
            <div className="mt-0.5">
              <Typography variant="small" className="!font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                {description}
              </Typography>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default SimpleStatisticsCard;

