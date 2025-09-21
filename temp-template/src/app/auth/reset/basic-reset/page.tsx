import React from "react";
import Link from "next/link";

// @material-tailwind/react
import { Input, Button, Typography } from "@/components/MaterialTailwind";

export default function BasicResetPage() {
  return (
    <section className="tw-grid tw-max-h-screen tw-h-screen tw-place-items-center">
      <div className="tw-w-full lg:tw-w-3/5 tw-flex tw-flex-col tw-items-center tw-justify-center">
        <div className="tw-text-center">
          <Typography variant="h2" className="!tw-font-bold tw-mb-4">
            Reset Password
          </Typography>
          <Typography className="tw-text-lg !tw-font-normal !tw-text-blue-gray-500">
            You will receive an e-mail in maximum 60 seconds
          </Typography>
        </div>
        <form className="tw-mt-8 tw-mx-auto tw-w-80 lg:tw-w-1/2">
          <div className="tw-flex tw-flex-col tw-gap-6">
            <Typography
              variant="small"
              color="blue-gray"
              className="-tw-mb-3 !tw-font-medium"
            >
              Your email
            </Typography>
            <Input size="lg" label="Your email" />
          </div>
          <Link href="/auth/signup/basic-signup">
            <Button className="tw-mt-6" fullWidth>
              Register Now
            </Button>
          </Link>
        </form>
      </div>
    </section>
  );
}
