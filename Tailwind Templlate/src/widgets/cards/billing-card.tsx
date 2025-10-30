import React from "react";

// @material-tailwind/react
import { Card, Button, Typography } from "@material-tailwind/react";

// @heroicons/react
import { PencilIcon, TrashIcon } from "@heroicons/react/24/solid";

interface PropTypes {
  title: React.ReactNode;
  options?: {};
}
export function BillingCard({ title, options }: PropTypes) {
  return (
    <Card
      shadow={false}
      className="tw-rounded-lg !tw-bg-blue-gray-100/20 tw-px-6 tw-py-3"
    >
      <div className="tw-mb-6 tw-flex tw-items-center tw-justify-between">
        <Typography variant="h6" color="blue-gray">
          {title}
        </Typography>
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-10">
          <div className="tw-flex tw-items-center tw-gap-1">
            <div className="tw-flex tw-items-center tw-justify-between">
              <Button
                size="sm"
                variant="text"
                color="red"
                className="tw-flex tw-items-center tw-gap-1"
              >
                <TrashIcon className="tw-h-3 tw-w-3 tw-text-red-500" />
                delete
              </Button>
              <Button
                size="sm"
                variant="text"
                color="gray"
                className="tw-flex tw-items-center tw-gap-1"
              >
                <PencilIcon className="tw-h-3 tw-w-3" />
                edit
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div>
        {options && (
          <div className="tw-grid">
            {Object.keys(options).map((label) => (
              <div key={label} className="tw-flex tw-gap-2">
                <Typography className="tw-mb-2 tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                  {label} :
                </Typography>
                <Typography
                  className="tw-mb-2 tw-text-xs !tw-font-bold"
                  color="blue-gray"
                >
                  {(options as any)[label]}
                </Typography>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export default BillingCard;
