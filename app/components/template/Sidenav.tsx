/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// @material-tailwind/react
import {
  Card,
  Typography,
  IconButton,
  Accordion,
  AccordionHeader,
  AccordionBody,
} from "@material-tailwind/react";

// @heroicons/react
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

// Context
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

interface SidenavProps {
  brandImg?: string;
  brandName?: string;
  routes?: Route[];
}

export default function Sidenav({
  brandImg = "/QIQI-Logo.svg",
  brandName,
  routes = [],
}: SidenavProps) {
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();

  const { sidenavType, sidenavColor, openSidenav, sidenavCollapsed }: any = controller;

  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);
  const [openSubCollapse, setOpenSubCollapse] = React.useState<string | null>(null);
  const [isHovering, setIsHovering] = React.useState(false);

  const handleOpenCollapse = (value: string) => {
    setOpenCollapse((cur) => (cur === value ? null : value));
  };

  const handleOpenSubCollapse = (value: string) => {
    setOpenSubCollapse((cur) => (cur === value ? null : value));
  };

  const sidenavRef = React.useRef<HTMLDivElement>(null);

  const handleClickOutside = () => {
    setOpenSidenav(dispatch, false);
  };

  const handleMouseEnter = () => {
    if (sidenavCollapsed) {
      setIsHovering(true);
    }
  };

  const handleMouseLeave = () => {
    if (sidenavCollapsed) {
      setIsHovering(false);
    }
  };

  // Auto-open accordions for current pathname
  React.useEffect(() => {
    routes.forEach((route) => {
      if (route.pages) {
        const hasActiveSubPage = route.pages.some((page) => {
          if (page.path) {
            return pathname === page.path || pathname.startsWith(page.path + '/');
          }
          return false;
        });
        if (hasActiveSubPage) {
          setOpenCollapse(route.name);
        }
        
        route.pages.forEach((page) => {
          if (page.pages) {
            const hasActiveNestedPage = page.pages.some((subPage) => {
              if (subPage.path) {
                return pathname === subPage.path || pathname.startsWith(subPage.path + '/');
              }
              return false;
            });
            if (hasActiveNestedPage) {
              setOpenSubCollapse(page.name);
              setOpenCollapse(route.name);
            }
          }
        });
      }
    });
  }, [pathname, routes]);

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

  const isCollapsed = sidenavCollapsed && !isHovering;
  const baseItemClasses = "cursor-pointer transition-all rounded-lg";
  const activeRouteClasses = `${COLORS[sidenavColor]} text-white`;

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
      className={`!fixed top-4 !z-50 h-[calc(100vh-2rem)] ${
        isCollapsed ? "w-[5rem] max-w-[5rem]" : "w-full max-w-[18rem]"
      } p-4 shadow-blue-gray-900/5 ${
        openSidenav ? "left-4" : "-left-72"
      } ${sidenavType === "transparent" ? "shadow-none" : "shadow-xl"} ${
        sidenavType === "dark" ? "!text-white" : "text-gray-900"
      }} transition-all duration-300 ease-in-out xl:left-4 overflow-y-scroll`}
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        href={pathname.startsWith("/client") ? "/client" : "/admin"}
        className="flex items-center justify-center h-20 p-4"
      >
        <img src={brandImg} className="h-12 w-auto" alt="logo" />
      </Link>
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

      <div className="text-inherit">
        {routes.map(({ name, icon, pages, title, divider, external, path }, key) =>
          pages ? (
            <React.Fragment key={key}>
              {title && !isCollapsed && (
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
              
              {/* Accordion Wrapper */}
              <Accordion
                open={openCollapse === name}
                icon={
                  !isCollapsed ? (
                    <ChevronDownIcon
                      strokeWidth={2.5}
                      className={`h-3 w-3 transition-transform ${
                        openCollapse === name ? "rotate-180" : ""
                      }`}
                    />
                  ) : null
                }
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
              >
                {/* Accordion Header */}
                <AccordionHeader
                  onClick={() => handleOpenCollapse(name)}
                  className={`${baseItemClasses} ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} ${openCollapse === name && sidenavType === "dark" ? "bg-white/10" : openCollapse === name ? "bg-gray-200" : ""} hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""} !border-0`}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  <div className={`flex items-center ${icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                    {icon}
                  </div>
                  {!isCollapsed && (
                    <Typography
                      color="inherit"
                      className="flex-1 font-normal capitalize"
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                    >
                      {name}
                    </Typography>
                  )}
                </AccordionHeader>

                {/* Accordion Body */}
                <AccordionBody className="!py-1 pl-0" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  <div>
                    {pages.map((page: Route, key) =>
                      page.pages ? (
                        // Nested Accordion
                        <Accordion
                          key={key}
                          open={openSubCollapse === page.name}
                          icon={
                            !isCollapsed ? (
                              <ChevronDownIcon
                                strokeWidth={2.5}
                                className={`h-3 w-3 transition-transform ${
                                  openSubCollapse === page.name ? "rotate-180" : ""
                                }`}
                              />
                            ) : null
                          }
                          placeholder={undefined}
                          onPointerEnterCapture={undefined}
                          onPointerLeaveCapture={undefined}
                        >
                          <AccordionHeader
                            onClick={() => handleOpenSubCollapse(page.name)}
                            className={`${baseItemClasses} ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} ${
                              openSubCollapse === page.name && sidenavType === "dark" ? "bg-white/10" : openSubCollapse === page.name ? "bg-gray-200" : ""
                            } hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""} !border-0`}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <div className={`flex items-center ${page.icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                              {page.icon}
                            </div>
                            {!isCollapsed && (
                              <Typography
                                color="inherit"
                                className="flex-1 font-normal capitalize"
                                placeholder={undefined}
                                onPointerEnterCapture={undefined}
                                onPointerLeaveCapture={undefined}
                              >
                                {page.name}
                              </Typography>
                            )}
                          </AccordionHeader>
                          <AccordionBody className="!py-1" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                            <div>
                              {page.pages.map((subPage: Route, key: number) =>
                                subPage.external ? (
                                  <a href={subPage.path} target="_blank" key={key}>
                                    <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                                      <div className={`flex items-center ${subPage.icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                                        {subPage.icon}
                                      </div>
                                      {!isCollapsed && subPage.name}
                                    </div>
                                  </a>
                                ) : (
                                  <Link href={subPage.path!} key={key}>
                                    <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} ${
                                      pathname === subPage.path ? activeRouteClasses : ""
                                    } hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                                      <div className={`flex items-center ${subPage.icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                                        {subPage.icon}
                                      </div>
                                      {!isCollapsed && subPage.name}
                                    </div>
                                  </Link>
                                )
                              )}
                            </div>
                          </AccordionBody>
                        </Accordion>
                      ) : page.external ? (
                        <a key={key} href={page.path} target="_blank">
                          <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                            <div className={`flex items-center ${page.icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                              {page.icon}
                            </div>
                            {!isCollapsed && page.name}
                          </div>
                        </a>
                      ) : (
                        <Link key={key} href={page.path!}>
                          <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} ${
                            pathname === page.path ? activeRouteClasses : ""
                          } hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                            <div className={`flex items-center ${page.icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                              {page.icon}
                            </div>
                            {!isCollapsed && page.name}
                          </div>
                        </Link>
                      )
                    )}
                  </div>
                </AccordionBody>
              </Accordion>
              
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </React.Fragment>
          ) : (
            <div key={key}>
              {external ? (
                <a href={path} target="_blank">
                  <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                    <div className={`flex items-center ${icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                      {icon}
                    </div>
                    {!isCollapsed && name}
                  </div>
                </a>
              ) : (
                <Link href={path!}>
                  <div className={`${baseItemClasses} flex items-center ${isCollapsed ? "py-2 px-0 justify-center" : "py-3 px-3"} ${
                    pathname === path ? activeRouteClasses : ""
                  } hover:bg-gray-100 ${sidenavType === "dark" ? "hover:bg-white/10" : ""}`}>
                    <div className={`flex items-center ${icon ? "w-5 h-5" : ""} ${isCollapsed ? "" : "mr-3"}`}>
                      {icon}
                    </div>
                    {!isCollapsed && name}
                  </div>
                </Link>
              )}
            </div>
          )
        )}
      </div>
    </Card>
  );
}
