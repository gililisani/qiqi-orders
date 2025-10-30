/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  Avatar,
  Typography,
  Tooltip,
  CardFooter,
} from "@material-tailwind/react";

type PropTypes = {
  img: string;
  title: React.ReactNode;
  description: React.ReactNode;
  options?: any;
  members?: {}[];
  action?: React.ReactNode;
};

export function ProjectCard({
  title,
  img,
  members = [],
  options = [],
  action,
  description,
}: PropTypes) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <div className="tw-flex tw-items-center tw-justify-start">
        <CardHeader
          floated={false}
          shadow={false}
          variant="gradient"
          color="gray"
          className="tw-grid tw-h-20 tw-w-20 tw-shrink-0 tw-place-items-center"
        >
          <img src={img} alt="" className="tw-h-14 tw-w-14" />
        </CardHeader>
        <div className="tw-flex tw-w-full tw-items-start tw-justify-between tw-pr-2 tw-pt-2">
          <div className="tw-flex tw-flex-col">
            <Typography className="!tw-font-semibold" color="blue-gray">
              {title}
            </Typography>
            {members.length > 0 && (
              <div>
                {members.map(({ img, name }: any, key) => (
                  <Tooltip key={name} content={name}>
                    <Avatar
                      src={img}
                      alt={name}
                      size="xs"
                      variant="circular"
                      className={`tw-cursor-pointer tw-border-2 tw-border-white ${
                        key === 0 ? "" : "-tw-ml-2.5"
                      }`}
                    />
                  </Tooltip>
                ))}
              </div>
            )}
          </div>
          {action}
        </div>
      </div>
      <CardBody className="tw-pt-6">
        <Typography variant="small" className="!tw-text-blue-gray-500">
          {description}
        </Typography>
      </CardBody>
      {options && (
        <CardFooter divider className="tw-flex tw-justify-between tw-py-4">
          {Object.keys(options).map((label) => (
            <div key={label} className="grid">
              <Typography
                variant="small"
                className="!tw-font-semibold"
                color="blue-gray"
              >
                {options[label]}
              </Typography>
              <Typography
                variant="small"
                className="!tw-text-blue-gray-500 !tw-font-normal"
              >
                {label}
              </Typography>
            </div>
          ))}
        </CardFooter>
      )}
    </Card>
  );
}

export default ProjectCard;
