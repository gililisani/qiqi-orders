"use client";
import React from "react";

// widget
import { MiniCard } from "@/widgets/cards";

// data
import { miniCardData } from "@/data";

type Props = {};

export default function MiniCards({}: Props) {
  return (
    <div className="tw-col-span-2 tw-grid tw-w-full tw-items-center tw-gap-6 md:tw-col-span-2">
      {miniCardData.map((props) => (
        <MiniCard key={props.title} {...props} />
      ))}
    </div>
  );
}
