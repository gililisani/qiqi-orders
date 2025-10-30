/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
  Button,
  Tooltip,
  Avatar,
} from "@material-tailwind/react";

import { colors } from "@material-tailwind/react/types/generic";

type PropTypes = {
  img: string;
  title: string;
  description: string;
  tag?: string;
  actionColor?: colors;
  actionLabel?: string;
  actionRoute?: string;
  members: { img: string; name: string }[];
};

export function BlogCard({
  img,
  title,
  description,
  tag,
  actionColor = "gray",
  actionLabel = "view more",
  actionRoute = "/",
  members,
}: PropTypes) {
  return (
    <Card color="transparent" shadow={false}>
      <CardHeader
        floated={false}
        color="gray"
        className="!tw-mx-0 !tw-mt-0 tw-mb-4 tw-h-64 xl:tw-h-40"
      >
        <img
          src={img}
          alt={title}
          className="tw-h-full tw-w-full tw-object-cover"
        />
      </CardHeader>
      <CardBody className="!tw-py-0 !tw-px-1">
        {tag && (
          <Typography
            variant="small"
            className="!tw-font-normal !tw-text-blue-gray-500"
          >
            {tag}
          </Typography>
        )}
        <Typography variant="h5" color="blue-gray" className="tw-mt-1 tw-mb-2">
          {title}
        </Typography>
        <Typography
          variant="small"
          className="!tw-font-normal !tw-text-blue-gray-500"
        >
          {description}
        </Typography>
      </CardBody>
      <CardFooter className="tw-mt-6 tw-flex tw-items-center tw-justify-between tw-py-0 tw-px-1">
        <Link href={actionRoute}>
          <Button variant="outlined" size="sm" color={actionColor}>
            {actionLabel}
          </Button>
        </Link>
        {members.length > 0 && (
          <div>
            {members.map(({ img, name }, key) => (
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
      </CardFooter>
    </Card>
  );
}

export default BlogCard;
