"use client";

// widgets
import { InfoCard } from "@/widgets/cards";

// @data
import { infoCardData } from "@/data";

type Props = {};

export default function InfoCards({}: Props) {
  return (
    <div className="tw-col-span-1 tw-flex tw-h-full tw-w-full tw-flex-col tw-gap-6 sm:tw-flex-row">
      {infoCardData.map((props) => (
        <InfoCard key={props.title + crypto.randomUUID()} {...props} />
      ))}
    </div>
  );
}
