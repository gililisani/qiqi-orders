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
  List,
  ListItem,
  ListItemPrefix,
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
  const activeRouteClasses = `${COLORS[sidenavColor]} text-white`;
  const collapseItemClasses = sidenavType === "dark" ? "text-white hover:bg-opacity-25 focus:bg-opacity-100 active:bg-opacity-10 hover:text-white focus:text-white active:text-white" : "";

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
      className={`!fixed top-4 !z-50 h-[calc(100vh-2rem)] transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-20 max-w-[5rem]" : "w-full max-w-[18rem]"
      } ${isCollapsed ? "" : "p-4"} shadow-blue-gray-900/5 ${
        openSidenav ? "left-4" : "-left-72"
      } ${sidenavType === "transparent" ? "shadow-none" : "shadow-xl"} ${
        sidenavType === "dark" ? "!text-white" : "text-gray-900"
      } xl:left-4 overflow-y-scroll`}
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Logo */}
      <Link
        href={pathname.startsWith("/client") ? "/client" : "/admin"}
        className="flex items-center justify-center h-20"
      >
        <img src={brandImg} className="h-12 w-auto" alt="logo" />
        <Typography 
          variant="h6" 
          color="blue-gray" 
          className={`ml-3 transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}
          placeholder={undefined} 
          onPointerEnterCapture={undefined} 
          onPointerLeaveCapture={undefined}
        >
          {brandName}
        </Typography>
      </Link>

      {/* Close button */}
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

      {/* Menu Items */}
      <List placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
        {routes.map(({ name, icon, pages, title, divider, external, path }, key) =>
          pages ? (
            <React.Fragment key={key}>
              {title && (
                <Typography
                  variant="small"
                  color="inherit"
                  className={`ml-2 mt-4 mb-1 text-xs font-bold uppercase transition-all duration-300 ${isCollapsed ? "opacity-0 h-0 overflow-hidden" : ""}`}
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
                  <ChevronDownIcon
                    strokeWidth={2.5}
                    className={`mx-auto h-3 w-3 text-inherit transition-transform ${
                      openCollapse === name ? "rotate-180" : ""
                    } ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}
                  />
                }
              >
                <ListItem
                  className={`!overflow-hidden !p-0 ${
                    openCollapse === name
                      ? sidenavType === "dark"
                        ? "bg-white/10"
                        : "bg-gray-200"
                      : ""
                  } ${collapseItemClasses}`}
                  selected={openCollapse === name}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  <AccordionHeader
                    onClick={() => handleOpenCollapse(name)}
                    className="border-b-0 !p-3 text-inherit hover:text-inherit focus:text-inherit active:text-inherit"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    <Typography
                      color="inherit"
                      className={`mr-auto font-normal capitalize transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                    >
                      {name}
                    </Typography>
                  </AccordionHeader>
                </ListItem>
                <AccordionBody className="!py-1 text-inherit">
                  <List className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    {pages.map((page: Route, key) =>
                      page.pages ? (
                        <Accordion
                          key={key}
                          open={openSubCollapse === page.name}
                          placeholder={undefined}
                          onPointerEnterCapture={undefined}
                          onPointerLeaveCapture={undefined}
                          icon={
                            <ChevronDownIcon
                              strokeWidth={2.5}
                              className={`mx-auto h-3 w-3 text-inherit transition-transform ${
                                openSubCollapse === page.name
                                  ? "rotate-180"
                                  : ""
                              } ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}
                            />
                          }
                        >
                          <ListItem
                            className={`!p-0 ${
                              openSubCollapse === page.name
                                ? sidenavType === "dark"
                                  ? "bg-white/10"
                                  : "bg-gray-200"
                                : ""
                            } ${collapseItemClasses}`}
                            selected={openSubCollapse === page.name}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <AccordionHeader
                              onClick={() => handleOpenSubCollapse(page.name)}
                              className="border-b-0 !p-3 text-inherit hover:text-inherit focus:text-inherit active:text-inherit"
                              placeholder={undefined}
                              onPointerEnterCapture={undefined}
                              onPointerLeaveCapture={undefined}
                            >
                              <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                {page.icon}
                              </ListItemPrefix>
                              <Typography
                                color="inherit"
                                className={`mr-auto font-normal capitalize transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}
                                placeholder={undefined}
                                onPointerEnterCapture={undefined}
                                onPointerLeaveCapture={undefined}
                              >
                                {page.name}
                              </Typography>
                            </AccordionHeader>
                          </ListItem>
                          <AccordionBody className="!py-1 text-inherit">
                            <List className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.pages.map((subPage: Route, key: number) =>
                                subPage.external ? (
                                  <a
                                    href={subPage.path}
                                    target="_blank"
                                    key={key}
                                  >
                                    <ListItem
                                      className="capitalize"
                                      placeholder={undefined}
                                      onPointerEnterCapture={undefined}
                                      onPointerLeaveCapture={undefined}
                                    >
                                      <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                        {subPage.icon}
                                      </ListItemPrefix>
                                      <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                                        {subPage.name}
                                      </span>
                                    </ListItem>
                                  </a>
                                ) : (
                                  <Link href={subPage.path!} key={key}>
                                    <ListItem
                                      className={`capitalize ${
                                        pathname === subPage.path
                                          ? activeRouteClasses
                                          : collapseItemClasses
                                      }`}
                                      placeholder={undefined}
                                      onPointerEnterCapture={undefined}
                                      onPointerLeaveCapture={undefined}
                                    >
                                      <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                        {subPage.icon}
                                      </ListItemPrefix>
                                      <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                                        {subPage.name}
                                      </span>
                                    </ListItem>
                                  </Link>
                                )
                              )}
                            </List>
                          </AccordionBody>
                        </Accordion>
                      ) : page.external ? (
                        <a key={key} href={page.path} target="_blank">
                          <ListItem 
                            className="capitalize"
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.icon}
                            </ListItemPrefix>
                            <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                              {page.name}
                            </span>
                          </ListItem>
                        </a>
                      ) : (
                        <Link href={page.path!} key={key}>
                          <ListItem
                            className={`capitalize ${
                              pathname === page.path
                                ? activeRouteClasses
                                : collapseItemClasses
                            }`}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                              {page.icon}
                            </ListItemPrefix>
                            <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                              {page.name}
                            </span>
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
            <List key={key} className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              {external ? (
                <a key={key} href={path} target="_blank">
                  <ListItem 
                    className="capitalize"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                      {name}
                    </span>
                  </ListItem>
                </a>
              ) : (
                <Link href={path!} key={key}>
                  <ListItem
                    className={`capitalize ${
                      pathname === path
                        ? activeRouteClasses
                        : collapseItemClasses
                    }`}
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ListItemPrefix placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      {icon}
                    </ListItemPrefix>
                    <span className={`transition-all duration-300 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : ""}`}>
                      {name}
                    </span>
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
