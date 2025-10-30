"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  List,
  ListItem,
  ListItemPrefix,
  Typography,
} from "@material-tailwind/react";

// @data
import { eventsCardData } from "@/data";

type Props = {};

export default function EventsCard({}: Props) {
  return (
    <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader floated={false} shadow={false} color="transparent">
        <Typography className="!tw-font-bold" color="blue-gray">
          Upcoming events
        </Typography>
        <Typography
          variant="small"
          className="tw-mt-1 !tw-text-blue-gray-500 !tw-font-normal"
        >
          Joined
        </Typography>
      </CardHeader>
      <CardBody className="!tw-p-0">
        <List>
          {eventsCardData.map(({ icon, title, date }) => (
            <ListItem className="tw-p-[9px]" key={title}>
              <ListItemPrefix>
                <div className="tw-rounded-lg tw-bg-gradient-to-tr tw-from-gray-900 tw-to-gray-800 tw-p-4 tw-shadow">
                  {React.createElement(icon, {
                    className: "tw-h-5 tw-w-5 tw-text-white",
                  })}
                </div>
              </ListItemPrefix>
              <div>
                <Typography
                  variant="small"
                  className="!tw-font-semibold"
                  color="blue-gray"
                >
                  {title}
                </Typography>
                <Typography
                  variant="small"
                  className="!tw-font-normal !tw-text-blue-gray-600"
                >
                  {date}
                </Typography>
              </div>
            </ListItem>
          ))}
        </List>
      </CardBody>
    </Card>
  );
}
