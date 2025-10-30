"use client";

// widgets
import { MasterCard } from "@/widgets/cards";

// data
import { masterCardData } from "@/data";

type Props = {};

export default function MasterCardComponent({}: Props) {
  return (
    <div className="tw-relative tw-col-span-1">
      <MasterCard {...masterCardData} />
    </div>
  );
}
