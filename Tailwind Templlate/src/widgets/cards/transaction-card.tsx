"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  IconButton,
  CardBody,
  Typography,
  CardHeader,
  List,
  ListItemPrefix,
  ListItemSuffix,
  ListItem,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { colors } from "@material-tailwind/react/types/generic";

type PropTypes = {
  title: string;
  date?: string;
  data: {
    title?: string;
    name: string;
    date: string;
    value: string;
    color?: "red" | "green" | colors;
    icon: any;
  }[];
};

export function TransactionCard({ title, date, data }: PropTypes) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        className="!tw-flex tw-justify-between tw-rounded-none"
      >
        <Typography className="!tw-font-bold" color="blue-gray">
          {title}
        </Typography>
        {date && (
          <div className="!tw-flex tw-gap-2 !tw-text-blue-gray-500">
            <CalendarDaysIcon className="tw-h-5 tw-w-5" />
            <Typography variant="small" className="!tw-font-normal">
              {date}
            </Typography>
          </div>
        )}
      </CardHeader>
      <CardBody className="!tw-p-0">
        <List>
          {data.map(({ title, name, date, value, color, icon }, key) => (
            <React.Fragment key={title + crypto.randomUUID()}>
              {title && (
                <Typography className="tw-mt-6 tw-mb-3 tw-ml-2 tw-block tw-text-xs !tw-font-bold tw-uppercase !tw-text-blue-gray-500">
                  {title}
                </Typography>
              )}
              <ListItem key={key}>
                <ListItemPrefix>
                  <IconButton
                    variant="outlined"
                    className="!tw-rounded-full"
                    color={color || "blue-gray"}
                  >
                    {React.createElement(icon, {
                      className: `tw-w-3 tw-h-3 tw-storke-2 tw-mx-auto ${color}`,
                    })}
                  </IconButton>
                </ListItemPrefix>
                <div className="tw-grid tw-gap-1">
                  <Typography
                    className="!tw-font-semibold"
                    color="blue-gray"
                    variant="small"
                  >
                    {name}
                  </Typography>
                  <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                    {date}
                  </Typography>
                </div>
                <ListItemSuffix className="tw-mr-2">
                  <Typography
                    variant="small"
                    className="tw-ml-auto !tw-font-semibold"
                    color={color || "blue-gray"}
                  >
                    {value}
                  </Typography>
                </ListItemSuffix>
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      </CardBody>
    </Card>
  );
}

export default TransactionCard;
