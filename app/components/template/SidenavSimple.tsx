/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Card } from "@material-tailwind/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useMaterialTailwindController, setOpenSidenav } from "@/app/context";

interface Route {
  name: string;
  icon?: React.ReactNode;
  pages?: Route[];
  title?: string;
  divider?: boolean;
  external?: boolean;
  path?: string;
}

interface SidenavSimpleProps {
  brandImg?: string;
  brandName?: string;
  routes?: Route[];
}

export default function SidenavSimple({
  brandImg = "/QIQI-Logo.svg",
  brandName,
  routes = [],
}: SidenavSimpleProps) {
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavType, sidenavColor, openSidenav }: any = controller;

  const [collapsed, setCollapsed] = React.useState(false);
  const [hovering, setHovering] = React.useState(false);
  const [openAccordions, setOpenAccordions] = React.useState<Record<string, boolean>>({});

  const isCollapsed = collapsed && !hovering;

  const sidenavRef = React.useRef<HTMLDivElement>(null);

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

  const toggleAccordion = (name: string) => {
    setOpenAccordions(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <Card
      ref={sidenavRef}
      color={sidenavType === "dark" ? "gray" : sidenavType === "transparent" ? "transparent" : "white"}
      shadow={sidenavType !== "transparent"}
      variant="gradient"
      className={`!fixed top-4 !z-50 h-[calc(100vh-2rem)] transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-16 max-w-[4rem]" : "w-full max-w-[18rem]"
      } ${isCollapsed ? "" : "p-4"} shadow-blue-gray-900/5 ${
        openSidenav ? "left-4" : "-left-72"
      } ${sidenavType === "transparent" ? "shadow-none" : "shadow-xl"} ${
        sidenavType === "dark" ? "!text-white" : "text-gray-900"
      } xl:left-4 overflow-y-scroll`}
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
      onMouseEnter={() => collapsed && setHovering(true)}
      onMouseLeave={() => collapsed && setHovering(false)}
    >
      {/* Collapse button */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="absolute top-2 right-2 p-2 hover:bg-gray-100 rounded"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          {collapsed ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
          )}
        </svg>
      </button>

      {/* Logo placeholder */}
      <div className="h-20" />

      {/* Menu Items */}
      <div>
        {routes.map(({ name, icon, pages, path }, key) =>
          pages ? (
            <div key={key} className="mb-1">
              {/* Accordion Header */}
              <button
                onClick={() => toggleAccordion(name)}
                className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                  isCollapsed ? "justify-center" : ""
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
                {!isCollapsed && (
                  <>
                    <span className="ml-3 flex-1 text-left">{name}</span>
                    <ChevronDownIcon
                      className={`h-4 w-4 transition-transform ${openAccordions[name] ? "rotate-180" : ""}`}
                    />
                  </>
                )}
              </button>

              {/* Accordion Body */}
              <div className={`overflow-hidden transition-all duration-300 ${openAccordions[name] ? "max-h-screen" : "max-h-0"}`}>
                {pages.map((page: Route, idx: number) =>
                  page.pages ? (
                    <div key={idx} className="mb-1">
                      {/* Nested Accordion */}
                      <button
                        onClick={() => toggleAccordion(`${name}-${page.name}`)}
                        className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                          isCollapsed ? "justify-center" : ""
                        }`}
                      >
                        <div className="w-5 h-5 flex items-center justify-center">{page.icon}</div>
                        {!isCollapsed && (
                          <>
                            <span className="ml-3 flex-1 text-left">{page.name}</span>
                            <ChevronDownIcon
                              className={`h-4 w-4 transition-transform ${openAccordions[`${name}-${page.name}`] ? "rotate-180" : ""}`}
                            />
                          </>
                        )}
                      </button>

                      {/* Nested Accordion Body */}
                      <div className={`overflow-hidden transition-all duration-300 ${openAccordions[`${name}-${page.name}`] ? "max-h-screen" : "max-h-0"}`}>
                        {page.pages.map((subPage: Route, subIdx: number) =>
                          subPage.external ? (
                            <a
                              key={subIdx}
                              href={subPage.path}
                              target="_blank"
                              className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                                isCollapsed ? "justify-center" : ""
                              } ${pathname === subPage.path ? "bg-gray-200" : ""}`}
                            >
                              <div className="w-5 h-5 flex items-center justify-center">{subPage.icon}</div>
                              {!isCollapsed && <span className="ml-3">{subPage.name}</span>}
                            </a>
                          ) : (
                            <Link
                              key={subIdx}
                              href={subPage.path!}
                              className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                                isCollapsed ? "justify-center" : ""
                              } ${pathname === subPage.path ? "bg-gray-200" : ""}`}
                            >
                              <div className="w-5 h-5 flex items-center justify-center">{subPage.icon}</div>
                              {!isCollapsed && <span className="ml-3">{subPage.name}</span>}
                            </Link>
                          )
                        )}
                      </div>
                    </div>
                  ) : page.external ? (
                    <a
                      key={idx}
                      href={page.path}
                      target="_blank"
                      className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                        isCollapsed ? "justify-center" : ""
                      }`}
                    >
                      <div className="w-5 h-5 flex items-center justify-center">{page.icon}</div>
                      {!isCollapsed && <span className="ml-3">{page.name}</span>}
                    </a>
                  ) : (
                    <Link
                      key={idx}
                      href={page.path!}
                      className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                        isCollapsed ? "justify-center" : ""
                      } ${pathname === page.path ? "bg-gray-200" : ""}`}
                    >
                      <div className="w-5 h-5 flex items-center justify-center">{page.icon}</div>
                      {!isCollapsed && <span className="ml-3">{page.name}</span>}
                    </Link>
                  )
                )}
              </div>
            </div>
          ) : (
            <div key={key} className="mb-1">
              {external ? (
                <a
                  href={path}
                  target="_blank"
                  className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                    isCollapsed ? "justify-center" : ""
                  } ${pathname === path ? "bg-gray-200" : ""}`}
                >
                  <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
                  {!isCollapsed && <span className="ml-3">{name}</span>}
                </a>
              ) : (
                <Link
                  href={path!}
                  className={`w-full flex items-center py-2 px-3 rounded-lg hover:bg-gray-100 transition-colors ${
                    isCollapsed ? "justify-center" : ""
                  } ${pathname === path ? "bg-gray-200" : ""}`}
                >
                  <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
                  {!isCollapsed && <span className="ml-3">{name}</span>}
                </Link>
              )}
            </div>
          )
        )}
      </div>
    </Card>
  );
}

