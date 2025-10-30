/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { MapPinIcon } from "@heroicons/react/24/solid";

type PropTypes = {
  img: string;
  title: React.ReactNode;
  description: React.ReactNode;
  price: string;
  location: string;
};

export function BookingCard({
  img,
  title,
  description,
  price,
  location,
}: PropTypes) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        color="blue-gray"
        className="tw-relative tw-h-60"
      >
        <img src={img} alt="image" className="tw-h-full tw-w-full" />
      </CardHeader>
      <CardBody className="tw-text-center">
        <Typography
          variant="h5"
          color="blue-gray"
          className="tw-mb-2 !tw-font-medium"
        >
          {title}
        </Typography>
        <Typography className="!tw-text-blue-gray-500">
          {description}
        </Typography>
      </CardBody>
      <CardFooter
        divider
        className="tw-flex tw-items-center tw-justify-between tw-py-5"
      >
        <Typography className="!tw-text-blue-gray-500">{price}</Typography>
        <Typography
          variant="small"
          className="tw-flex tw-gap-1 !tw-text-blue-gray-500"
        >
          <MapPinIcon className="tw-mt-px tw-h-4 tw-w-4 tw-text-blue-gray-600" />
          {location}
        </Typography>
      </CardFooter>
    </Card>
  );
}

export default BookingCard;
