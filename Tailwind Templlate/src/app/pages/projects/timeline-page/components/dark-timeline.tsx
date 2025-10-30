"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  Timeline,
  TimelineItem,
  TimelineConnector,
  TimelineHeader,
  TimelineIcon,
  TimelineBody,
  Typography,
  CardHeader,
  CardBody,
} from "@material-tailwind/react";

// @data
import { timelineCardData } from "@/data";

type Props = {};

export default function DarkTimeline({}: Props) {
  return (
    <Card variant="gradient" color="gray" className="tw-shadow-sm">
      <CardHeader color="transparent" floated={false} shadow={false}>
        <Typography variant="h6" color="white">
          Timeline with dotted line
        </Typography>
      </CardHeader>
      <CardBody>
        <Timeline>
          {timelineCardData.map(
            ({ icon, bgcolor, title, detail, date }, idx) => (
              <TimelineItem key={title}>
                {idx !== timelineCardData.length - 1 && (
                  <TimelineConnector className="tw-scale-y-110 !tw-opacity-20" />
                )}
                <TimelineHeader>
                  <TimelineIcon className={`!tw-p-2 ${bgcolor}`}>
                    {React.createElement(icon, {
                      className: "tw-w-3.5 tw-h-3.5 tw-text-white",
                    })}
                  </TimelineIcon>
                  <div className="tw-flex tw-flex-col tw-gap-1">
                    <Typography variant="small" className="!tw-font-bold">
                      {title}
                    </Typography>
                    <Typography
                      color="white"
                      className="tw-text-xs !tw-font-normal tw-opacity-30"
                    >
                      {date}
                    </Typography>
                  </div>
                </TimelineHeader>
                <TimelineBody
                  className={`tw-max-w-lg !tw-px-3
                      ${idx !== timelineCardData.length - 1 ? "!tw-pb-8" : ""}
                    `}
                >
                  <Typography variant="small" className="!tw-font-normal">
                    {detail}
                  </Typography>
                </TimelineBody>
              </TimelineItem>
            )
          )}
        </Timeline>
      </CardBody>
    </Card>
  );
}
