"use client";

import { bookingCardData } from "@/data";
import { BookingCard } from "@/widgets/cards";

type Props = {};

export default function BookingCards({}: Props) {
  return (
    <div className="tw-grid tw-gap-6 md:tw-grid-cols-2 xl:tw-grid-cols-3">
      {bookingCardData.map((props) => (
        <BookingCard key={props.title} {...props} />
      ))}
    </div>
  );
}
