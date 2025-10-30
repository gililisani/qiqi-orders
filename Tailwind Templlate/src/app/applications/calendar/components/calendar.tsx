"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";

// data
import calendarData from "@/data/calendar-data";

type Props = {};

export default function Calendar({}: Props) {
  return (
    <FullCalendar
      plugins={[dayGridPlugin]}
      initialView="dayGridMonth"
      initialDate="2023-08-10"
      events={calendarData}
      eventColor={(calendarData as any).className}
      selectable
      editable
    />
  );
}
