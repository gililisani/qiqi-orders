"use client";
import React from "react";

// @material-tailwind/react
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Tooltip,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { ExclamationCircleIcon } from "@heroicons/react/24/outline";

// widgets
import { PieChart } from "@/widgets/charts";

type Props = {};

export default function Channels({}: Props) {
  return (
    <div className="tw-col-span-1">
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardHeader
          floated={false}
          shadow={false}
          className="tw-mb-6 tw-flex tw-justify-between tw-gap-8 tw-overflow-visible"
        >
          <Typography variant="h6" color="blue-gray">
            Channels
          </Typography>
          <Tooltip content="See traffic channels" placement="left">
            <ExclamationCircleIcon
              strokeWidth={1}
              className="tw-w-8 tw-h-8 !tw-text-blue-gray-600"
            />
          </Tooltip>
        </CardHeader>
        <CardBody>
          <PieChart
            height={238}
            series={[20, 20, 20, 75]}
            labels={["Facebook", "Direct", "Organic", "Referral"]}
            colors={["#49a3f1", "#d81b60", "#191919", "#495361"]}
            options={{
              legend: {
                show: true,
                position: "right",
                horizontalAlign: "center",
                offsetX: 0,
                offsetY: 40,
                markers: {
                  width: 8,
                  height: 8,
                  radius: 8,
                },
                itemMargin: {
                  vertical: 4,
                },
              },
              responsive: [
                {
                  breakpoint: 1580,
                  options: {
                    legend: {
                      show: false,
                    },
                  },
                },
              ],
            }}
          />
          <div className="tw-mt-10 tw-mb-4 tw-flex tw-items-end tw-justify-between tw-px-4">
            <Typography
              variant="small"
              className="!tw-text-blue-gray-500 !tw-font-normal tw-w-64"
            >
              More than <strong>1,200,000</strong> sales are made using referral
              marketing, and <strong>700,000</strong> are from social media.
            </Typography>
            <Button>read more</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
