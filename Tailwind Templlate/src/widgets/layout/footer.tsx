import React from "react";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

// @heroicons/react
import { HeartIcon } from "@heroicons/react/24/solid";

type PropTypes = {
  brandName?: string;
  brandLink?: string;
  routes?: { name: string; path: string }[];
};

export function Footer({
  brandName = "Creative Tim",
  brandLink = "https://www.creative-tim.com",
  routes = [
    { name: "Creative Tim", path: "https://www.creative-tim.com" },
    { name: "About Us", path: "https://www.creative-tim.com/presentation" },
    { name: "Blog", path: "https://www.creative-tim.com/blog" },
    { name: "License", path: "https://www.creative-tim.com/license" },
  ],
}: PropTypes) {
  const year = new Date().getFullYear();

  return (
    <footer className="tw-py-2">
      <div className="tw-flex tw-w-full tw-flex-wrap tw-items-center tw-justify-center tw-gap-6 tw-px-2 md:tw-justify-between">
        <Typography variant="small" className="!tw-font-normal tw-text-inherit">
          &copy; {year}, made with{" "}
          <HeartIcon className="-tw-mt-0.5 tw-inline-block tw-h-3.5 tw-w-3.5 tw-text-gray-900" />{" "}
          by{" "}
          <a
            href={brandLink}
            target="_blank"
            className="tw-transition-colors hover:tw-text-blue-gray-900 !tw-font-bold"
          >
            {brandName}
          </a>{" "}
          for a better web.
        </Typography>
        <ul className="tw-flex tw-items-center tw-gap-4">
          {routes.map(({ name, path }: { name: string; path: string }) => (
            <li key={name}>
              <Typography
                as="a"
                href={path}
                target="_blank"
                variant="small"
                className="tw-py-0.5 tw-px-1 !tw-font-normal tw-text-inherit tw-transition-colors hover:tw-text-blue-gray-900"
              >
                {name}
              </Typography>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}

export default Footer;
