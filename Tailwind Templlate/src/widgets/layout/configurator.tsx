import React from "react";

// @material-tailwind/react
import {
  Button,
  IconButton,
  Switch,
  Typography,
  Chip,
} from "@material-tailwind/react";

// @context
import {
  useMaterialTailwindController,
  setOpenConfigurator,
  setSidenavColor,
  setSidenavType,
  setFixedNavbar,
} from "@/context";

// @heroicons/react
import { XMarkIcon } from "@heroicons/react/24/outline";

function formatNumber(number: any, decPlaces: number) {
  decPlaces = Math.pow(10, decPlaces);

  const abbrev = ["K", "M", "B", "T"];

  for (let i = abbrev.length - 1; i >= 0; i--) {
    var size = Math.pow(10, (i + 1) * 3);

    if (size <= number) {
      number = Math.round((number * decPlaces) / size) / decPlaces;

      if (number == 1000 && i < abbrev.length - 1) {
        number = 1;
        i++;
      }

      number += abbrev[i];

      break;
    }
  }

  return number;
}

const sidenavColors = {
  pink: "tw-from-pink-400 tw-to-pink-600",
  dark: "tw-from-black tw-to-black border-gray-200",
  blue: "tw-from-blue-400 tw-to-blue-600",
  green: "tw-from-green-400 tw-to-green-600",
  orange: "tw-from-orange-400 tw-to-orange-600",
  red: "tw-from-red-400 tw-to-red-600",
};

export function Configurator() {
  const [stars, setStars] = React.useState(0);
  const [controller, dispatch] = useMaterialTailwindController();
  const { openConfigurator, sidenavColor, sidenavType, fixedNavbar } =
    controller;

  React.useEffect(() => {
    const stars = fetch(
      "https://api.github.com/repos/creativetimofficial/ct-material-tailwind-dashboard-nextjs-pro"
    )
      .then((response) => response.json())
      .then((data) => setStars(formatNumber(data.stargazers_count, 1)));
  }, []);

  return (
    <aside
      className={`tw-fixed tw-top-0 tw-right-0 tw-z-50 tw-h-screen tw-w-96 tw-bg-white tw-px-2.5 tw-shadow-lg tw-transition-transform tw-duration-300 ${
        openConfigurator ? "tw-translate-x-0" : "tw-translate-x-96"
      }`}
    >
      <div className="tw-flex tw-items-start tw-justify-between tw-px-6 tw-pt-8 tw-pb-6">
        <div>
          <Typography variant="h5" color="blue-gray">
            Dashboard Configurator
          </Typography>
          <Typography className="!tw-font-normal !tw-text-blue-gray-600">
            See our dashboard options.
          </Typography>
        </div>
        <IconButton
          variant="text"
          color="blue-gray"
          onClick={() => setOpenConfigurator(dispatch, false)}
        >
          <XMarkIcon strokeWidth={2.5} className="tw-h-5 tw-w-5" />
        </IconButton>
      </div>
      <hr className="tw-w-[318px] tw-mx-auto" />
      <div className="tw-py-4 tw-px-6">
        <div className="tw-mb-8">
          <Typography variant="h6" color="blue-gray">
            Sidenav Colors
          </Typography>
          <div className="tw-mt-3 tw-flex tw-items-center tw-gap-2">
            {Object.keys(sidenavColors).map((color) => (
              <span
                key={color}
                className={`tw-h-6 tw-w-6 tw-cursor-pointer tw-rounded-full tw-border tw-bg-gradient-to-br tw-transition-transform hover:tw-scale-105 ${
                  sidenavColors[color as keyof typeof sidenavColors]
                } ${
                  sidenavColor === color
                    ? "tw-border-black"
                    : "tw-border-transparent"
                }`}
                onClick={() => setSidenavColor(dispatch, color)}
              />
            ))}
          </div>
        </div>
        <div className="tw-mb-4">
          <Typography variant="h6" color="blue-gray">
            Sidenav Types
          </Typography>
          <Typography
            variant="small"
            className="!tw-font-normal !tw-text-blue-gray-500"
          >
            Choose between different sidenav types.
          </Typography>
          <div className="tw-mt-4 tw-flex tw-items-center tw-gap-2">
            <Button
              variant={sidenavType === "dark" ? "gradient" : "outlined"}
              onClick={() => setSidenavType(dispatch, "dark")}
            >
              Dark
            </Button>
            <Button
              variant={sidenavType === "transparent" ? "gradient" : "outlined"}
              onClick={() => setSidenavType(dispatch, "transparent")}
            >
              Transparent
            </Button>
            <Button
              variant={sidenavType === "white" ? "gradient" : "outlined"}
              onClick={() => setSidenavType(dispatch, "white")}
            >
              White
            </Button>
          </div>
        </div>
        <div className="tw-mb-12">
          <div className="tw-flex tw-items-center tw-justify-between tw-py-5">
            <Typography variant="h6" color="blue-gray">
              Navbar Fixed
            </Typography>
            <Switch
              id="navbar-fixed"
              value={String(fixedNavbar)}
              onChange={() => setFixedNavbar(dispatch, !fixedNavbar)}
              crossOrigin={undefined}
            />
          </div>
          <hr />
          <div className="tw-my-8 tw-flex tw-flex-col tw-gap-4">
            <a
              href="https://www.creative-tim.com/product/material-tailwind-dashboard-nextjs-pro?rel=mtdnp"
              target="_black"
            >
              <Button variant="gradient" fullWidth>
                buy now
              </Button>
            </a>
            <a
              href="https://www.material-tailwind.com/docs/react/installation?rel=mtdnp"
              target="_black"
            >
              <Button variant="outlined" color="gray" fullWidth>
                View Documentation
              </Button>
            </a>
          </div>
          <a
            className="tw-mx-auto tw-flex tw-items-center tw-justify-center tw-gap-2"
            href="https://github.com/creativetimofficial/ct-material-tailwind-dashboard-nextjs-pro"
            target="_blank"
            rel="noreferrer"
          >
            <Chip
              value={`Star ${stars}`}
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="tw-mt-px tw-ml-1.5 tw-h-4 tw-w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z"
                    clipRule="evenodd"
                  />
                </svg>
              }
              className="tw-bg-blue-gray-900 !tw-pr-4 !tw-pl-8"
            />
          </a>
        </div>
        <div className="tw-text-center">
          <Typography variant="h6" color="gray">
            Thank you for sharing!
          </Typography>
          <div className="tw-mt-4 tw-flex tw-justify-center tw-gap-2">
            <Button
              variant="gradient"
              className="tw-flex tw-items-center tw-gap-2"
            >
              <i className="fa-brands fa-twitter tw-text-white" />
              Tweet
            </Button>
            <Button
              variant="gradient"
              className="tw-flex tw-items-center tw-gap-2"
            >
              <i className="fa-brands fa-facebook tw-text-white" />
              Share
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Configurator;
