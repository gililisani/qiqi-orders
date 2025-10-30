"use client";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

// widgets
import { BillingCard } from "@/widgets/cards";

type Props = {};

// Billing Card Data
const BILLING_CARD_DATA = [
  {
    title: "Oliver Liam",
    options: {
      "Company Name": "Viking Burrito",
      "Email Address": "oliver@burrito.com",
      "VAT Number": "FRB1235476",
    },
  },
];
export default function BillingInformation({}: Props) {
  return (
    <div>
      <Typography className="tw-mb-4 tw-mt-6 !tw-font-bold" color="blue-gray">
        Billing Information
      </Typography>
      <div className="tw-flex tw-flex-col tw-gap-6">
        {BILLING_CARD_DATA.map((props, key) => (
          <BillingCard key={key} {...props} />
        ))}
      </div>
    </div>
  );
}
