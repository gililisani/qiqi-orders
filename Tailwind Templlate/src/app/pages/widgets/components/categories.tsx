"use client";

import React from "react";

//@material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  List,
  ListItem,
  ListItemPrefix,
  ListItemSuffix,
  Typography,
} from "@material-tailwind/react";

// @heroicons/react
import { ChevronRightIcon } from "@heroicons/react/24/solid";

// data
import { categoriesCardData } from "@/data";

type Props = {};

export default function Categories({}: Props) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader floated={false} shadow={false} color="transparent">
        <Typography className="!tw-font-bold" color="blue-gray">
          Categories
        </Typography>
      </CardHeader>
      <CardBody className="!tw-p-0">
        <List className="!tw-pb-0">
          {categoriesCardData.map(({ icon, title, detail, detail2 }) => (
            <ListItem key={title}>
              <div className="tw-flex tw-items-center">
                <ListItemPrefix
                  color="gray"
                  className="tw-rounded-lg tw-bg-gradient-to-tr tw-from-gray-900 tw-to-gray-800 tw-p-3 tw-shadow"
                >
                  {React.createElement(icon, {
                    className: "tw-w-4 tw-h-4 tw-text-white",
                  })}
                </ListItemPrefix>
                <div className="grid">
                  <Typography
                    variant="small"
                    className="!tw-font-semibold"
                    color="blue-gray"
                  >
                    {title}
                  </Typography>
                  <div className="tw-flex tw-gap-1">
                    {detail && (
                      <Typography className="tw-text-xs !tw-font-normal !tw-text-blue-gray-600">
                        {detail}
                      </Typography>
                    )}
                    <Typography className="tw-text-xs !tw-font-bold !tw-text-blue-gray-600">
                      {detail2}
                    </Typography>
                  </div>
                </div>
              </div>
              <ListItemSuffix>
                <ChevronRightIcon className="tw-h-3 tw-w-3" />
              </ListItemSuffix>
            </ListItem>
          ))}
        </List>
      </CardBody>
    </Card>
  );
}
