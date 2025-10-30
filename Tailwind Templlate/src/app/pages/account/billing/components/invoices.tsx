"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  Button,
  Typography,
  CardHeader,
  List,
  ListItem,
  ListItemSuffix,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { DocumentIcon } from "@heroicons/react/24/solid";

// @data
import { invoiceCardData } from "@/data";

type Props = {};

export default function Invoices({}: Props) {
  return (
    <Card className="tw-col-span-1 tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        className="tw-flex tw-justify-between !tw-rounded-none"
      >
        <Typography className="!tw-font-bold" color="blue-gray">
          Invoices
        </Typography>
        <Button variant="outlined" size="sm">
          view all
        </Button>
      </CardHeader>
      <CardBody className="!tw-p-0">
        <List>
          {invoiceCardData.map(({ date, detail, value }) => (
            <ListItem key={crypto.randomUUID()}>
              <div className="tw-grid tw-gap-1">
                <Typography
                  variant="small"
                  className="!tw-font-bold"
                  color="blue-gray"
                >
                  {date}
                </Typography>
                <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-500">
                  {detail}
                </Typography>
              </div>
              <ListItemSuffix className="!tw-flex tw-gap-2">
                <Typography
                  variant="small"
                  className="!tw-text-blue-gray-500 !tw-font-normal"
                >
                  {value}
                </Typography>
                <DocumentIcon className="tw-h-5 tw-w-5 tw-text-gray-900" />
              </ListItemSuffix>
            </ListItem>
          ))}
        </List>
      </CardBody>
    </Card>
  );
}
