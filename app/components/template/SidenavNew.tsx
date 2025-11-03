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
  Accordion,
  AccordionHeader,
  AccordionBody,
  IconButton,
} from "@material-tailwind/react";

import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { useMaterialTailwindController, setOpenSidenav } from "@/app/context";

const COLORS: Record<string, string> = {
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
};

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

  // Collapse rail + hover-to-peek
  const [collapsed, setCollapsed] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const isRail = collapsed && !hovering;

  // Accordions
  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);
  const [openSubCollapse, setOpenSubCollapse] = React.useState<string | null>(
    null
  );

  const handleOpenCollapse = (value: string) =>
    setOpenCollapse((cur) => (cur === value ? null : value));

  const handleOpenSubCollapse = (value: string) =>
    setOpenSubCollapse((cur) => (cur === value ? null : value));

  const sidenavRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (sidenavRef.current && !sidenavRef.current.contains(event.target as Node)) {
        setOpenSidenav(dispatch, false);
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

  const activeRouteClasses = `${collapseItemClasses} ${COLORS[sidenavColor] || ""} text-white active:text-white hover:text-white focus:text-white`;

  // SHARED ROW LAYOUT (no indent): icon column + label column
  const rowBase =
    "grid grid-cols-[1.75rem,1fr] items-center gap-2 rounded-lg";
  const rowPadding = isRail ? "py-2 px-0" : "py-2.5 px-3";
  const rowHover =
    sidenavType === "dark" ? "hover:bg-white/10" : "hover:bg-gray-100";

  // Render icon cell (centered, fixed width)
  const IconCell = ({ children }: { children?: React.ReactNode }) => (
    <span className="flex h-5 w-5 items-center justify-center">
      {children}
    </span>
  );

  // Render label cell (hidden only in rail mode)
  const LabelCell = ({ children }: { children?: React.ReactNode }) =>
    isRail ? null : <span className="truncate">{children}</span>;

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
      {/* Header */}
      <div
        className={[
          "flex items-center",
          isRail ? "justify-center h-12 !p-2" : "justify-between h-20 !p-4",
        ].join(" ")}
      >
        <Link href={pathname.startsWith("/client") ? "/client" : "/admin"} className="flex items-center gap-2">
          <img
            src={brandImg}
            className={isRail ? "h-8 w-auto" : "h-7 w-7"}
            alt="logo"
          />
          {!isRail && (
            <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              {brandName}
            </Typography>
          )}
        </Link>

        {/* Collapse toggle */}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((v) => !v)}
          className="hidden xl:inline-flex items-center justify-center rounded-md p-2 hover:bg-gray-100/50"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            {collapsed ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M3 6h18M3 12h10M3 18h18"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M20 12H8m0 0l4-4m-4 4l4 4"
              />
            )}
          </svg>
        </button>

        {/* Mobile close */}
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
        {routes.map(
          ({ name, icon, pages, title, divider, external, path }: Route, key: number) =>
            pages ? (
              <React.Fragment key={`${name}-${key}`}>
                {!isRail && title && (
                  <Typography
                    variant="small"
                    color="inherit"
                    className="ml-1 mt-3 mb-1 text-[11px] font-bold uppercase opacity-70"
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
                        className={`ml-auto h-3 w-3 text-inherit transition-transform ${
                          openCollapse === name ? "rotate-180" : ""
                        }`}
                      />
                    ) : null
                  }
                >
                  {/* Top-level row (no indent) */}
                  <div
                    className={[
                      rowBase,
                      rowPadding,
                      rowHover,
                      openCollapse === name
                        ? sidenavType === "dark"
                          ? "bg-white/10"
                          : "bg-gray-200"
                        : "",
                      "cursor-pointer",
                    ].join(" ")}
                  >
                    <AccordionHeader
                      onClick={() => handleOpenCollapse(name)}
                      aria-expanded={openCollapse === name}
                      className="!border-0 !p-0 w-full"
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                    >
                      <div className={[rowBase, "w-full"].join(" ")}>
                        <IconCell>{icon}</IconCell>
                        <LabelCell>{name}</LabelCell>
                      </div>
                    </AccordionHeader>
                  </div>

                  {/* Submenu (still no indent) */}
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
                                  className={`ml-auto h-3 w-3 text-inherit transition-transform ${
                                    openSubCollapse === page.name
                                      ? "rotate-180"
                                      : ""
                                  }`}
                                />
                              ) : null
                            }
                          >
                            {/* Second level header (no indent) */}
                            <div
                              className={[
                                rowBase,
                                rowPadding,
                                rowHover,
                                openSubCollapse === page.name
                                  ? sidenavType === "dark"
                                    ? "bg-white/10"
                                    : "bg-gray-200"
                                  : "",
                                "cursor-pointer",
                              ].join(" ")}
                            >
                              <AccordionHeader
                                onClick={() => handleOpenSubCollapse(page.name)}
                                aria-expanded={openSubCollapse === page.name}
                                className="!border-0 !p-0 w-full"
                                placeholder={undefined}
                                onPointerEnterCapture={undefined}
                                onPointerLeaveCapture={undefined}
                              >
                                <div className={[rowBase, "w-full"].join(" ")}>
                                  <IconCell>{page.icon}</IconCell>
                                  <LabelCell>{page.name}</LabelCell>
                                </div>
                              </AccordionHeader>
                            </div>

                            {/* Third level items (no indent) */}
                            <AccordionBody className="!py-1 text-inherit">
                              <List className="!p-0 text-inherit" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                                {page.pages.map((subPage: Route, i: number) =>
                                  subPage.external ? (
                                    <a
                                      key={`${subPage.name}-${i}`}
                                      href={subPage.path}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={[rowBase, rowPadding, rowHover].join(" ")}
                                    >
                                      <IconCell>{subPage.icon}</IconCell>
                                      <LabelCell>{subPage.name}</LabelCell>
                                    </a>
                                  ) : (
                                    <Link href={`${subPage.path}`} key={`${subPage.name}-${i}`}>
                                      <div
                                        className={[
                                          rowBase,
                                          rowPadding,
                                          rowHover,
                                          pathname === `${subPage.path}`
                                            ? activeRouteClasses
                                            : collapseItemClasses,
                                        ].join(" ")}
                                      >
                                        <IconCell>{subPage.icon}</IconCell>
                                        <LabelCell>{subPage.name}</LabelCell>
                                      </div>
                                    </Link>
                                  )
                                )}
                              </List>
                            </AccordionBody>
                          </Accordion>
                        ) : page.external ? (
                          <a
                            key={`${page.name}-${subKey}`}
                            href={page.path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={[rowBase, rowPadding, rowHover].join(" ")}
                          >
                            <IconCell>{page.icon}</IconCell>
                            <LabelCell>{page.name}</LabelCell>
                          </a>
                        ) : (
                          <Link href={page.path!} key={`${page.name}-${subKey}`}>
                            <div
                              className={[
                                rowBase,
                                rowPadding,
                                rowHover,
                                pathname === page.path
                                  ? activeRouteClasses
                                  : collapseItemClasses,
                              ].join(" ")}
                            >
                              <IconCell>{page.icon}</IconCell>
                              <LabelCell>{page.name}</LabelCell>
                            </div>
                          </Link>
                        )
                      )}
                    </List>
                  </AccordionBody>
                </Accordion>
                {divider && <hr className="my-2 border-blue-gray-50" />}
              </React.Fragment>
            ) : (
              <div className="!p-0 text-inherit" key={`${name}-${key}`}>
                {external ? (
                  <a
                    href={path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={[rowBase, rowPadding, rowHover].join(" ")}
                  >
                    <IconCell>{icon}</IconCell>
                    <LabelCell>{name}</LabelCell>
                  </a>
                ) : (
                  <Link href={path!}>
                    <div
                      className={[
                        rowBase,
                        rowPadding,
                        rowHover,
                        pathname === path ? activeRouteClasses : collapseItemClasses,
                      ].join(" ")}
                    >
                      <IconCell>{icon}</IconCell>
                      <LabelCell>{name}</LabelCell>
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
