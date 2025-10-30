import React from "react";

// @material-tailwind/react
import { Typography } from "@material-tailwind/react";

type PropTypes = {
  brandName?: string;
  brandLink?: string;
  routes?: { name: string; path: string }[];
};

export function AuthFooter({
  brandName = "Creative Tim",
  brandLink = "https://www.creative-tim.com",
  routes = [
    { name: "Company", path: "https://www.creative-tim.com" },
    { name: "About Us", path: "https://www.creative-tim.com/presentation" },
    { name: "Team", path: "https://www.creative-tim.com/presentation" },
    { name: "Product", path: "https://www.creative-tim.com/presentation" },
    { name: "Blog", path: "https://www.creative-tim.com/blog" },
    { name: "License", path: "https://www.creative-tim.com/license" },
  ],
}: PropTypes) {
  const year = new Date().getFullYear();

  return (
    <footer className="tw-pb-10">
      <div className="tw-grid tw-items-center tw-justify-center tw-gap-6">
        <ul className="tw-flex tw-items-center tw-gap-4">
          {routes.map(({ name, path }) => (
            <li key={name}>
              <Typography
                as="a"
                href={path}
                target="_blank"
                className="tw-py-0.5 tw-px-1 !tw-font-normal !tw-text-blue-gray-500 tw-transition-colors hover:!tw-text-blue-gray-900"
              >
                {name}
              </Typography>
            </li>
          ))}
        </ul>
        <div className="tw-flex tw-gap-6 tw-text-blue-gray-900 tw-justify-center">
          <i className="fa-brands fa-facebook tw-text-blue-gray-900 tw-text-lg" />
          <i className="fa-brands fa-twitter tw-text-blue-gray-900 tw-text-lg " />
          <i className="fa-brands fa-instagram tw-text-blue-gray-900 tw-text-lg " />
          <i className="fa-brands fa-pinterest tw-text-blue-gray-900 tw-text-lg " />
          <i className="fa-brands fa-linkedin tw-text-blue-gray-900 tw-text-lg" />
        </div>
        <Typography className="!tw-font-normal !tw-text-blue-gray-500 tw-text-center">
          Copyright &copy; {year} Material by{" "}
          <a
            href={brandLink}
            target="_blank"
            className="tw-transition-colors hover:!tw-text-blue-gray-900 !tw-font-bold"
          >
            {brandName}
          </a>
        </Typography>
      </div>
    </footer>
  );
}

export default AuthFooter;
