/* eslint-disable @next/next/no-img-element */
"use client";
import React from "react";

// @material-tailwind/react
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  IconButton,
  Tooltip,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { PencilIcon, PlusIcon } from "@heroicons/react/24/solid";

// data
import { paymentMethodData } from "@/data";

type Props = {};

export default function PaymentMethods({}: Props) {
  return (
    <Card className="tw-col-span-2 tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        className="tw-flex tw-justify-between !tw-rounded-none"
      >
        <Typography className="!tw-font-bold" color="blue-gray">
          Payment Method
        </Typography>
        <Button variant="gradient" color="gray" className="tw-flex tw-gap-3">
          <PlusIcon className="tw-h-4 tw-w-4" />
          add new card
        </Button>
      </CardHeader>
      <CardBody className="tw-pt-4 tw-px-4 tw-flex tw-flex-col tw-justify-between tw-gap-6 md:tw-flex-row">
        {paymentMethodData.map(({ img, number }) => (
          <div
            className="tw-flex tw-w-full tw-items-center tw-gap-4 tw-rounded-md tw-p-6 tw-outline tw-outline-blue-gray-300/20"
            key={number + crypto.randomUUID()}
          >
            <img src={img} alt="card img" className="tw-h-8" />
            <div className="tw-flex tw-items-center tw-gap-2">
              {number.split(",").map((num) => (
                <Typography
                  key={num + crypto.randomUUID()}
                  color="gray"
                  className="!tw-font-bold"
                >
                  {num}
                </Typography>
              ))}
            </div>
            <Tooltip content="Edit">
              <IconButton
                size="sm"
                variant="text"
                color="gray"
                className="tw-ml-auto"
              >
                <PencilIcon className="tw-h-4 tw-w-4" />
              </IconButton>
            </Tooltip>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
