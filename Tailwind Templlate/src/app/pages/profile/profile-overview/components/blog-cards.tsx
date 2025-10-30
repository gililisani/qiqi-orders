"use client";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

// widget
import { BlogCard } from "@/widgets/cards";

// data
import { blogCardData } from "@/data";

type Props = {};

export default function BlogCards({}: Props) {
  return (
    <div className="tw-px-4 tw-pb-4">
      <Typography variant="h6" color="blue-gray" className="tw-mb-2">
        Projects
      </Typography>
      <Typography
        variant="small"
        className="!tw-font-normal !tw-text-blue-gray-500"
      >
        Architects design houses
      </Typography>
      <div className="tw-mt-6 tw-grid tw-grid-cols-1 tw-gap-12 md:tw-grid-cols-2 xl:tw-grid-cols-4">
        {blogCardData.map((props, key) => (
          <BlogCard key={key} {...props} />
        ))}
      </div>
    </div>
  );
}
