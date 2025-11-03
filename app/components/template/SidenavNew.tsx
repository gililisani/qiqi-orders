/* eslint-disable @next/next/no-img-element */

"use client";

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

import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { useMaterialTailwindController, setOpenSidenav } from "@/app/context";

const COLORS = {
  dark: "bg-gray-900 hover:bg-gray-700 focus:bg-gray-900 active:bg-gray-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
  blue: "bg-blue-500 hover:bg-blue-700 focus:bg-blue-700 active:bg-blue-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
  "blue-gray":
    "bg-blue-gray-900 hover:bg-blue-gray-900 focus:bg-blue-gray-900 active:bg-blue-gray-900 hover:bg-opacity-80 focus:bg-opacity-80 active:bg-opacity-80",
  green:
    "bg-green-500 hover:bg-green-700 focus:bg-green-700 active:bg-green-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
  orange:
    "bg-orange-500 hover:bg-orange-700 focus:bg-orange-700 active:bg-orange-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
  red: "bg-red-500 hover:bg-red-700 focus:bg-red-700 active:bg-red-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
  pink: "bg-pink-500 hover:bg-pink-700 focus:bg-pink-700 active:bg-pink-700 hover:bg-opacity-100 focus:bg-opacity-100 active:bg-opacity-100",
} as any;

interface Route {
  name: string;
  icon?: React.ReactNode;
  pages?: Route[];
  title?: string;
  divider?: boolean;
  external?: boolean;
  path?: string;
}

interface SidenavNewProps {
  brandImg?: string;
  brandName?: string;
  routes?: Route[];
}

export default function SidenavNew({
  brandImg = "/QIQI-Logo.svg",
  brandName,
  routes = [],
}: SidenavNewProps) {
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();

  const { sidenavType, sidenavColor, openSidenav }: any = controller;

  // NEW: collapse state for whole sidebar + hover-to-peek
  const [collapsed, setCollapsed] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const isRail = collapsed && !hovering;

  // Existing accordions
  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);
  const [openSubCollapse, setOpenSubCollapse] = React.useState<string | null>(null);

  const handleOpenCollapse = (value: string) =>
    setOpenCollapse((cur) => (cur === value ? null : value));

  const handleOpenSubCollapse = (value: string) =>
    setOpenSubCollapse((cur) => (cur === value ? null : value));

  const sidenavRef = React.useRef<HTMLDivElement | null>(null);

  const handleClickOutside = () => setOpenSidenav(dispatch, false);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (sidenavRef.current && !sidenavRef.current.contains(event.target as Node)) {
        handleClickOutside();
      }
    };
    if (openSidenav) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [openSidenav]);

  const collapseItemClasses =
    sidenavType === "dark"
      ? "text-white hover:bg-opacity-25 focus:bg-opacity-100 active:bg-opacity-10 hover:text-white focus:text-white active:text-white"
      : "";

  const collapseHeaderClasses =
    "border-b-0 !p-3 text-inherit hover:text-inherit focus:text-inherit active:text-inherit";

  const activeRouteClasses = `${collapseItemClasses} ${COLORS[sidenavColor]} text-white active:text-white hover:text-white focus:text-white`;

  return (
    <Card
      ref={sidenavRef}
      color={
        sidenavType === "dark"
          ? "gray"
          : sidenavType === "transparent"
          ? "transparent"
          : "white"
      }
      shadow={sidenavType !== "transparent"}
      variant="gradient"
      className={[
        "!fixed top-4 !z-50 h-[calc(100vh-2rem)]",
        isRail ? "w-20 max-w-[5rem] p-2" : "w-full max-w-[18rem] p-4",
        "shadow-blue-gray-900/5",
        openSidenav ? "left-4" : "-left-72",
        sidenavType === "transparent" ? "shadow-none" : "shadow-xl",
        sidenavType === "dark" ? "!text-white" : "text-gray-900",
        "transition-all duration-300 ease-in-out xl:left-4 overflow-y-scroll",
      ].join(" ")}
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
      onMouseEnter={() => collapsed && setHovering(true)}
      onMouseLeave={() => collapsed && setHovering(false)}
    >
      {/* Brand + toggles */}
      <div className={[
        "flex items-center",
        isRail ? "justify-center h-12 !p-2" : "justify-between h-20 !p-4"
      ].join(" ")}>
        <Link href={pathname.startsWith("/client") ? "/client" : "/admin"} className="flex items-center gap-2">
          <img src={brandImg} className={isRail ? "h-8 w-auto" : "h-7 w-7"} alt="logo" />
          {!isRail && (
            <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              {brandName}
            </Typography>
          )}
        </Link>
        
        {/* Collapse toggle (desktop) */}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((v) => !v)}
          className="hidden xl:inline-flex items-center justify-center rounded-md p-2 transition-opacity hover:bg-gray-100/50"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {/* Icon toggles: hamburger when collapsed, arrow when expanded */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {collapsed ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 6h18M3 12h10M3 18h18" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H8m0 0l4-4m-4 4l4 4" />
            )}
          </svg>
        </button>

        {/* Mobile close button */}
        <IconButton
          ripple={false}
          size="sm"
          variant="text"
          className="!absolute top-1 right-1 block xl:hidden"
          onClick={() => setOpenSidenav(dispatch, false)}
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <XMarkIcon className="w-5 h-5" />
        </IconButton>
      </div>

      {/* NAV */}
      <List className="text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
        {routes.map(({ name, icon, pages, title, divider, external, path }: Route, key: number) =>
          pages ? (
            <React.Fragment key={`${name}-${key}`}>
              {!isRail && title && (
                <Typography
                  variant="small"
                  color="inherit"
                  className="ml-2 mt-4 mb-1 text-xs font-bold uppercase"
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  {title}
                </Typography>
              )}

              <Accordion
                open={openCollapse === name}
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
                icon={
                  !isRail ? (
                    <ChevronDownIcon
                      strokeWidth={2.5}
                      className={`mx-auto h-3 w-3 text-inherit transition-transform ${
                        openCollapse === name ? "rotate-180" : ""
                      }`}
                    />
                  ) : null
                }
              >
                <ListItem
                  className={[
                    "!overflow-hidden !p-0",
                    openCollapse === name
                      ? sidenavType === "dark"
                        ? "bg-white/10"
                        : "bg-gray-200"
                      : "",
                    collapseItemClasses,
                    isRail ? "justify-center" : ""
                  ].join(" ")}
                  selected={openCollapse === name}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  <AccordionHeader
                    onClick={() => handleOpenCollapse(name)}
                    aria-expanded={openCollapse === name}
                    className={[collapseHeaderClasses, isRail ? "py-2 px-0" : "py-3 px-3"].join(" ")}
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    {!isRail && (
                      <Typography color="inherit" className="mr-auto font-normal capitalize" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                        {name}
                      </Typography>
                    )}
                  </AccordionHeader>
                </ListItem>
                <AccordionBody className="!py-1 text-inherit">
                  <List className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    {pages.map((page: Route, subKey: number) =>
                      page.pages ? (
                        <Accordion
                          key={`${page.name}-${subKey}`}
                          open={openSubCollapse === page.name}
                          placeholder={undefined}
                          onPointerEnterCapture={undefined}
                          onPointerLeaveCapture={undefined}
                          icon={
                            !isRail ? (
                              <ChevronDownIcon
                                strokeWidth={2.5}
                                className={`mx-auto h-3 w-3 text-inherit transition-transform ${
                                  openSubCollapse === page.name ? "rotate-180" : ""
                                }`}
                              />
                            ) : null
                          }
                        >
                          <ListItem
                            className={[
                              "!p-0",
                              openSubCollapse === page.name
                                ? sidenavType === "dark"
                                  ? "bg-white/10"
                                  : "bg-gray-200"
                                : "",
                              collapseItemClasses,
                              isRail ? "justify-center" : ""
                            ].join(" ")}
                            selected={openSubCollapse === page.name}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <AccordionHeader
                              onClick={() => handleOpenSubCollapse(page.name)}
                              aria-expanded={openSubCollapse === page.name}
                              className={[collapseHeaderClasses, isRail ? "py-2 px-0" : "py-3 px-3"].join(" ")}
                              placeholder={undefined}
                              onPointerEnterCapture={undefined}
                              onPointerLeaveCapture={undefined}
                            >
                              <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                {page.icon}
                              </ListItemPrefix>
                              {!isRail && (
                                <Typography color="inherit" className="mr-auto font-normal capitalize" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                  {page.name}
                                </Typography>
                              )}
                            </AccordionHeader>
                          </ListItem>
                          <AccordionBody className="!py-1 text-inherit">
                            <List className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.pages.map((subPage: Route, i: number) =>
                                subPage.external ? (
                                  <a
                                    key={`${subPage.name}-${i}`}
                                    href={subPage.path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ListItem
                                      className={`capitalize ${isRail ? "justify-center py-2 px-0" : ""}`}
                                      placeholder={undefined}
                                      onPointerEnterCapture={undefined}
                                      onPointerLeaveCapture={undefined}
                                    >
                                      <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                        {subPage.icon}
                                      </ListItemPrefix>
                                      {!isRail && subPage.name}
                                    </ListItem>
                                  </a>
                                ) : (
                                  <Link href={`${subPage.path}`} key={`${subPage.name}-${i}`}>
                                    <ListItem
                                      className={`capitalize ${
                                        pathname === `${subPage.path}` ? activeRouteClasses : collapseItemClasses
                                      } ${isRail ? "justify-center py-2 px-0" : ""}`}
                                      placeholder={undefined}
                                      onPointerEnterCapture={undefined}
                                      onPointerLeaveCapture={undefined}
                                    >
                                      <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                        {subPage.icon}
                                      </ListItemPrefix>
                                      {!isRail && subPage.name}
                                    </ListItem>
                                  </Link>
                                )
                              )}
                            </List>
                          </AccordionBody>
                        </Accordion>
                      ) : page.external ? (
                        <a key={`${page.name}-${subKey}`} href={page.path} target="_blank" rel="noopener noreferrer">
                          <ListItem className={`capitalize ${isRail ? "justify-center py-2 px-0" : ""}`} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                            <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.icon}
                            </ListItemPrefix>
                            {!isRail && page.name}
                          </ListItem>
                        </a>
                      ) : (
                        <Link href={page.path!} key={`${page.name}-${subKey}`}>
                          <ListItem
                            className={`capitalize ${
                              pathname === page.path ? activeRouteClasses : collapseItemClasses
                            } ${isRail ? "justify-center py-2 px-0" : ""}`}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.icon}
                            </ListItemPrefix>
                            {!isRail && page.name}
                          </ListItem>
                        </Link>
                      )
                    )}
                  </List>
                </AccordionBody>
              </Accordion>
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </React.Fragment>
          ) : (
            <List className="!p-0 text-inherit" key={`${name}-${key}`} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              {external ? (
                <a href={path} target="_blank" rel="noopener noreferrer">
                  <ListItem className={`capitalize ${isRail ? "justify-center py-2 px-0" : ""}`} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    {!isRail && name}
                  </ListItem>
                </a>
              ) : (
                <Link href={path!}>
                  <ListItem
                    className={`capitalize ${
                      pathname === path ? activeRouteClasses : collapseItemClasses
                    } ${isRail ? "justify-center py-2 px-0" : ""}`}
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ListItemPrefix className={isRail ? "mr-0" : "mr-2"} placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    {!isRail && name}
                  </ListItem>
                </Link>
              )}
            </List>
          )
        )}
      </List>
    </Card>
  );
}

