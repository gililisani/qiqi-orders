"use client";
import React from "react";
// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
} from "@material-tailwind/react";

type PropTypes = {
  title: string;
  description?: React.ReactNode;
  details?: {};
  action?: any;
};

export function ProfileInfoCard({
  title,
  description = null,
  details = {},
  action = null,
}: PropTypes) {
  return (
    <Card color="transparent" shadow={false}>
      <CardHeader
        color="transparent"
        shadow={false}
        floated={false}
        className="!tw-mx-0 !tw-mt-0 tw-mb-3 !tw-rounded-none tw-flex tw-items-center tw-justify-between tw-gap-4"
      >
        <Typography variant="h6" color="blue-gray">
          {title}
        </Typography>
        {action}
      </CardHeader>
      <CardBody className="!tw-p-0">
        {description && (
          <Typography
            variant="small"
            className="!tw-font-normal !tw-text-blue-gray-500"
          >
            {description}
          </Typography>
        )}
        {description && details ? (
          <hr className="tw-my-8 tw-border-blue-gray-50" />
        ) : null}
        {details && (
          <ul className="tw-flex tw-flex-col tw-gap-4 tw-p-0">
            {Object.keys(details).map((el, key) => (
              <li key={key} className="tw-flex tw-items-center tw-gap-4">
                <Typography
                  variant="small"
                  color="blue-gray"
                  className="!tw-font-semibold tw-capitalize"
                >
                  {el}:
                </Typography>
                {typeof (details as any)[el] === "string" ? (
                  <Typography
                    variant="small"
                    className="!tw-font-normal !tw-text-blue-gray-500"
                  >
                    {(details as any)[el]}
                  </Typography>
                ) : (
                  (details as any)[el]
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

export default ProfileInfoCard;
