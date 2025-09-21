"use client";

import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
} from "@material-tailwind/react";

// Calendar
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid"; // a plugin!

// data
import { calendarData } from "@/data";

type Props = {};

export default function Calendar({}: Props) {
  return (
    <Card className="tw-max-w-full tw-w-full !tw-overflow-hidden tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader shadow={false} floated={false}>
        <Typography variant="h6" className="!tw-font-bold" color="blue-gray">
          Calendar
        </Typography>
        <Typography
          variant="small"
          className="!tw-font-normal !tw-text-blue-gray-500"
        >
          Monday, 2023
        </Typography>
      </CardHeader>
      <CardBody className="!tw-pt-0">
        <FullCalendar
          plugins={[dayGridPlugin]}
          initialView="dayGridMonth"
          initialDate="2023-08-10"
          events={calendarData}
          selectable
          editable
          headerToolbar={{
            start: "",
            center: "",
            end: "",
          }}
        />
      </CardBody>
    </Card>
  );
}
