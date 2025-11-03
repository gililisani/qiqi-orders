/* eslint-disable @next/next/no-img-element */
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Card,
  Typography,
  List,
  ListItem,
  ListItemPrefix,
  Accordion,
  AccordionHeader,
  AccordionBody,
  IconButton,
} from "@material-tailwind/react";
import routes from "@/routes";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useOnClickOutside } from "usehooks-ts";
import { useMaterialTailwindController, setOpenSidenav } from "@/context";

const COLORS: Record<string, string> = {
  dark: "tw-bg-gray-900 hover:tw-bg-gray-700 focus:tw-bg-gray-900 active:tw-bg-gray-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  blue: "tw-bg-blue-500 hover:tw-bg-blue-700 focus:tw-bg-blue-700 active:tw-bg-blue-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  "blue-gray":
    "tw-bg-blue-gray-900 hover:tw-bg-blue-gray-900 focus:tw-bg-blue-gray-900 active:tw-bg-blue-gray-900 hover:tw-bg-opacity-80 focus:tw-bg-opacity-80 active:tw-bg-opacity-80",
  green:
    "tw-bg-green-500 hover:tw-bg-green-700 focus:tw-bg-green-700 active:tw-bg-green-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  orange:
    "tw-bg-orange-500 hover:tw-bg-orange-700 focus:tw-bg-orange-700 active:tw-bg-orange-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  red: "tw-bg-red-500 hover:tw-bg-red-700 focus:tw-bg-red-700 active:tw-bg-red-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
  pink: "tw-bg-pink-500 hover:tw-bg-pink-700 focus:tw-bg-pink-700 active:tw-bg-pink-700 hover:tw-bg-opacity-100 focus:tw-bg-opacity-100 active:tw-bg-opacity-100",
};

export default function Sidenav({
  brandImg = "/img/logo-ct.png",
  brandName = "Material Tailwind PRO",
}: { brandImg?: string; brandName?: string }) {
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType, sidenavColor, openSidenav }: any = controller;

  // Rail collapse (start expanded to avoid confusion)
  const [collapsed, setCollapsed] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const isRail = collapsed && !hovering;

  // Accordions
  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);
  const [openSubCollapse, setOpenSubCollapse] = React.useState<string | null>(null);

  const handleOpenCollapse = (value: string) =>
    setOpenCollapse((cur) => (cur === value ? null : value));
  const handleOpenSubCollapse = (value: string) =>
    setOpenSubCollapse((cur) => (cur === value ? null : value));

  const sidenavRef = React.useRef<HTMLDivElement | null>(null);
  useOnClickOutside(sidenavRef, () => setOpenSidenav(dispatch, false));

  const collapseItemClasses =
    sidenavType === "dark"
      ? "tw-text-white hover:tw-bg-opacity-25 focus:tw-bg-opacity-100 active:tw-bg-opacity-10 hover:tw-text-white focus:tw-text-white active:tw-text-white"
      : "";

  const activeRouteClasses = `${collapseItemClasses} ${COLORS[sidenavColor] || ""} tw-text-white active:tw-text-white hover:tw-text-white focus:tw-text-white`;

  // No-indent row: 2-column grid for ALL levels
  const rowBase = "tw-grid tw-grid-cols-[1.75rem,1fr] tw-items-center tw-gap-2 tw-rounded-lg";
  const rowPad = isRail ? "tw-py-2 tw-px-0" : "tw-py-2.5 tw-px-3";
  const rowHover = sidenavType === "dark" ? "hover:tw-bg-white/10" : "hover:tw-bg-gray-100";

  return (
    <Card
      ref={sidenavRef}
      color={sidenavType === "dark" ? "gray" : sidenavType === "transparent" ? "transparent" : "white"}
      shadow={sidenavType !== "transparent"}
      variant="gradient"
      className={[
        "!tw-fixed tw-top-4 !tw-z-50 tw-h-[calc(100vh-2rem)]",
        isRail ? "tw-w-[5rem] tw-max-w-[5rem] tw-p-2" : "tw-w-full tw-max-w-[18rem] tw-p-4",
        "tw-shadow-blue-gray-900/5",
        openSidenav ? "tw-left-4" : "-tw-left-72",
        sidenavType === "transparent" ? "shadow-none" : "shadow-xl",
        sidenavType === "dark" ? "!tw-text-white" : "tw-text-gray-900",
        "tw-transition-all tw-duration-300 tw-ease-in-out xl:tw-left-4 tw-overflow-y-scroll",
      ].join(" ")}
      onMouseEnter={() => collapsed && setHovering(true)}
      onMouseLeave={() => collapsed && setHovering(false)}
    >
      {/* Header */}
      <div className={["tw-flex tw-items-center", isRail ? "tw-justify-center tw-h-12 !tw-p-2" : "tw-justify-between tw-h-20 !tw-p-4"].join(" ")}>
        <Link href="/" className="tw-flex tw-items-center tw-gap-2">
          <img src={brandImg} className={isRail ? "tw-h-8 tw-w-auto" : "tw-h-7 tw-w-7"} alt="logo" />
          {!isRail && <Typography variant="h6" color="blue-gray">{brandName}</Typography>}
        </Link>

        {/* Collapse toggle (desktop) */}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((v) => !v)}
          className="tw-hidden xl:tw-inline-flex tw-items-center tw-justify-center tw-rounded-md tw-p-2 hover:tw-bg-gray-100/50"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="tw-h-5 tw-w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6h18M3 12h10M3 18h18" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H8m0 0l4-4m-4 4l4 4" />
            )}
          </svg>
        </button>

        {/* Mobile close */}
        <IconButton
          ripple={false}
          size="sm"
          variant="text"
          className="!tw-absolute tw-top-1 tw-right-1 tw-block xl:tw-hidden"
          onClick={() => setOpenSidenav(dispatch, false)}
        >
          <XMarkIcon className="tw-w-5 tw-h-5" />
        </IconButton>
      </div>

      {/* NAV */}
      <List className="tw-text-inherit">
        {routes.map(({ name, icon, pages, title, divider, external, path }: any, key: number) =>
          pages ? (
            <React.Fragment key={`${name}-${key}`}>
              {!isRail && title && (
                <Typography variant="small" color="inherit" className="tw-ml-1 tw-mt-3 tw-mb-1 tw-text-[11px] tw-font-bold tw-uppercase tw-opacity-70">
                  {title}
                </Typography>
              )}

              {/* LEVEL 1 */}
              <Accordion
                open={openCollapse === name}
                icon={
                  !isRail ? (
                    <ChevronDownIcon
                      strokeWidth={2.5}
                      className={`tw-ml-auto tw-h-3 tw-w-3 tw-text-inherit tw-transition-transform ${
                        openCollapse === name ? "tw-rotate-180" : ""
                      }`}
                    />
                  ) : null
                }
              >
                <ListItem
                  className={[
                    "!tw-overflow-hidden !tw-p-0",
                    openCollapse === name ? (sidenavType === "dark" ? "tw-bg-white/10" : "tw-bg-gray-200") : "",
                    collapseItemClasses,
                    isRail ? "tw-justify-center" : "",
                  ].join(" ")}
                  selected={openCollapse === name}
                >
                  <AccordionHeader
                    onClick={() => handleOpenCollapse(name)}
                    aria-expanded={openCollapse === name}
                    className={`!tw-border-0 !tw-p-0 ${rowBase} ${rowPad} ${rowHover} tw-w-full`}
                  >
                    <ListItemPrefix className="tw-mr-0">
                      <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{icon}</span>
                    </ListItemPrefix>
                    {!isRail && <span className="tw-truncate">{name}</span>}
                  </AccordionHeader>
                </ListItem>

                {/* LEVEL 2 */}
                <AccordionBody className="!tw-py-1 tw-text-inherit">
                  <List className="!tw-p-0 tw-text-inherit">
                    {pages.map((page: any, subKey: number) =>
                      page.pages ? (
                        <Accordion
                          key={`${page.name}-${subKey}`}
                          open={openSubCollapse === page.name}
                          icon={
                            !isRail ? (
                              <ChevronDownIcon
                                strokeWidth={2.5}
                                className={`tw-ml-auto tw-h-3 tw-w-3 tw-text-inherit tw-transition-transform ${
                                  openSubCollapse === page.name ? "tw-rotate-180" : ""
                                }`}
                              />
                            ) : null
                          }
                        >
                          <ListItem
                            className={[
                              "!tw-p-0",
                              openSubCollapse === page.name ? (sidenavType === "dark" ? "tw-bg-white/10" : "tw-bg-gray-200") : "",
                              collapseItemClasses,
                              isRail ? "tw-justify-center" : "",
                            ].join(" ")}
                            selected={openSubCollapse === page.name}
                          >
                            <AccordionHeader
                              onClick={() => handleOpenSubCollapse(page.name)}
                              aria-expanded={openSubCollapse === page.name}
                              className={`!tw-border-0 !tw-p-0 ${rowBase} ${rowPad} ${rowHover} tw-w-full`}
                            >
                              <ListItemPrefix className="tw-mr-0">
                                <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{page.icon}</span>
                              </ListItemPrefix>
                              {!isRail && <span className="tw-truncate">{page.name}</span>}
                            </AccordionHeader>
                          </ListItem>

                          {/* LEVEL 3 */}
                          <AccordionBody className="!tw-py-1 tw-text-inherit">
                            <List className="!tw-p-0 tw-text-inherit">
                              {page.pages.map((subPage: any, i: number) =>
                                subPage.external ? (
                                  <a
                                    key={`${subPage.name}-${i}`}
                                    href={subPage.path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${rowBase} ${rowPad} ${rowHover}`}
                                  >
                                    <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{subPage.icon}</span>
                                    {!isRail && <span className="tw-truncate">{subPage.name}</span>}
                                  </a>
                                ) : (
                                  <Link href={`${subPage.path}`} key={`${subPage.name}-${i}`}>
                                    <div
                                      className={`${rowBase} ${rowPad} ${rowHover} ${
                                        pathname === `${subPage.path}` ? activeRouteClasses : collapseItemClasses
                                      }`}
                                    >
                                      <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{subPage.icon}</span>
                                      {!isRail && <span className="tw-truncate">{subPage.name}</span>}
                                    </div>
                                  </Link>
                                )
                              )}
                            </List>
                          </AccordionBody>
                        </Accordion>
                      ) : page.external ? (
                        <a key={`${page.name}-${subKey}`} href={page.path} target="_blank" rel="noopener noreferrer">
                          <div className={`${rowBase} ${rowPad} ${rowHover}`}>
                            <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{page.icon}</span>
                            {!isRail && <span className="tw-truncate">{page.name}</span>}
                          </div>
                        </a>
                      ) : (
                        <Link href={page.path} key={`${page.name}-${subKey}`}>
                          <div
                            className={`${rowBase} ${rowPad} ${rowHover} ${
                              pathname === `${page.path}` ? activeRouteClasses : collapseItemClasses
                            }`}
                          >
                            <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{page.icon}</span>
                            {!isRail && <span className="tw-truncate">{page.name}</span>}
                          </div>
                        </Link>
                      )
                    )}
                  </List>
                </AccordionBody>
              </Accordion>

              {divider && <hr className="tw-my-2 tw-border-blue-gray-50" />}
            </React.Fragment>
          ) : (
            <div className="!tw-p-0 tw-text-inherit" key={`${name}-${key}`}>
              {external ? (
                <a href={path} target="_blank" rel="noopener noreferrer">
                  <div className={`${rowBase} ${rowPad} ${rowHover}`}>
                    <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{icon}</span>
                    {!isRail && <span className="tw-truncate">{name}</span>}
                  </div>
                </a>
              ) : (
                <Link href={`${path}`}>
                  <div
                    className={`${rowBase} ${rowPad} ${rowHover} ${
                      pathname === `${path}` ? activeRouteClasses : collapseItemClasses
                    }`}
                  >
                    <span className="tw-flex tw-h-5 tw-w-5 tw-items-center tw-justify-center">{icon}</span>
                    {!isRail && <span className="tw-truncate">{name}</span>}
                  </div>
                </Link>
              )}
            </div>
          )
        )}
      </List>
    </Card>
  );
}
