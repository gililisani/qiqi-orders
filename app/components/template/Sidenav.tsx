/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// @material-tailwind/react
import { Card, Typography, IconButton } from "@material-tailwind/react";

// @heroicons/react
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

// Context
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
  const hoverBackgroundClass = sidenavType === "dark" ? "hover:bg-white/10" : "hover:bg-gray-100";
  
  // Map sidenavColor to gradient classes for active items
  const getActiveItemClasses = () => {
    const colorMap: Record<string, string> = {
      pink: "bg-gradient-to-r from-pink-400 to-pink-600 text-white",
      dark: "bg-gradient-to-r from-black to-black text-white",
      blue: "bg-gradient-to-r from-blue-400 to-blue-600 text-white",
      green: "bg-gradient-to-r from-green-400 to-green-600 text-white",
      orange: "bg-gradient-to-r from-orange-400 to-orange-600 text-white",
      red: "bg-gradient-to-r from-red-400 to-red-600 text-white",
    };
    
    // Default fallback based on sidenavType if color not found
    const defaultClass = sidenavType === "dark" ? "bg-white/10 text-white" : "bg-gray-200 text-gray-900";
    
    return colorMap[sidenavColor] || defaultClass;
  };
  
  const activeItemClass = getActiveItemClasses();

  const isRouteActive = React.useMemo(() => {
    const check = (route: Route): boolean => {
      if (route.path && (pathname === route.path || pathname.startsWith(`${route.path}/`))) {
        return true;
      }
      if (route.pages) {
        return route.pages.some((child) => check(child));
      }
      return false;
    };

    return check;
  }, [pathname]);

  React.useEffect(() => {
    let parentToOpen: string | null = null;
    let childToOpen: string | null = null;

    routes.forEach((route) => {
      if (route.pages && isRouteActive(route)) {
        parentToOpen = route.name;

        route.pages.forEach((page) => {
          if (page.pages && isRouteActive(page)) {
            childToOpen = page.name;
          }
        });
      }
    });

    if (parentToOpen !== null && parentToOpen !== openCollapse) {
      setOpenCollapse(parentToOpen);
    }

    if (childToOpen !== null && childToOpen !== openSubCollapse) {
      setOpenSubCollapse(childToOpen);
    }
  }, [routes, isRouteActive]);

  const getSpacingClasses = () => {
    return isCollapsed ? "px-3 justify-start" : "px-3 justify-start";
  };

  const renderMenuItems = (items: Route[], level = 0) => (
    <ul className={`flex flex-col gap-1 ${level === 0 ? "" : "mt-1"}`}>
      {items.map(({ name, icon, pages, title, divider, external, path }, index) => {
        const key = `${name}-${index}`;
        const hasChildren = Array.isArray(pages) && pages.length > 0;
        // Check if this route is active (exact match or nested route)
        const isActiveLeaf = !hasChildren && path 
          ? (pathname === path || pathname.startsWith(`${path}/`)) 
          : false;
        const isOpen = level === 0 ? openCollapse === name : openSubCollapse === name;

        const itemBaseClasses = [
          "group relative flex items-center w-full min-h-[44px] rounded-lg transition-all duration-300 ease-in-out overflow-hidden text-inherit active:scale-[0.98]",
          // Only add hover class if item is not active (active items should keep gradient, hover can slightly darken it)
          isActiveLeaf ? "" : hoverBackgroundClass,
          getSpacingClasses(),
          isCollapsed ? "gap-0" : "gap-3",
          "focus:outline-none focus-visible:outline-none",
        ];

        // Add active item classes if this is the active route
        if (isActiveLeaf) {
          itemBaseClasses.push(activeItemClass);
          // Add a subtle hover effect for active items (slightly darker gradient)
          itemBaseClasses.push("hover:opacity-90");
        }

        const iconWrapperClasses = "flex-shrink-0 flex items-center justify-center h-5 w-5 text-inherit";

        const labelClasses = [
          "min-w-0 flex-1 text-sm font-normal capitalize text-left overflow-hidden whitespace-nowrap transition-all duration-200",
          isCollapsed ? "max-w-0 opacity-0 pointer-events-none" : "max-w-full opacity-100",
        ].join(" ");

        const chevronClasses = [
          "flex-shrink-0 h-3 w-3 transition-transform duration-300",
          isOpen ? "rotate-180" : "",
          isCollapsed ? "opacity-0 invisible" : "ml-auto opacity-100",
        ].join(" ");

        const itemClasses = itemBaseClasses.join(" ");

        const renderLabel = (text: string) => <span className={labelClasses}>{text}</span>;

        const toggleAccordion = () => {
          const toggle = level === 0 ? setOpenCollapse : setOpenSubCollapse;
          toggle((cur: string | null) => (cur === name ? null : name));
        };

        if (hasChildren) {
          return (
            <li key={key} className="text-inherit">
              {title && level === 0 && (
                <Typography
                  variant="small"
                  color="inherit"
                  className={`ml-2 mt-4 mb-1 text-xs font-bold uppercase transition-opacity duration-300 ${
                    isCollapsed ? "opacity-0 h-0 overflow-hidden" : "opacity-100"
                  }`}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  {title}
                </Typography>
              )}

              <button
                type="button"
                onClick={toggleAccordion}
                className={itemClasses}
              >
                <span className={iconWrapperClasses}>{icon}</span>
                {renderLabel(name)}
                <ChevronDownIcon className={chevronClasses} />
              </button>

              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  {pages && renderMenuItems(pages, level + 1)}
                </div>
              </div>

              {divider && <hr className="my-2 border-blue-gray-50" />}
            </li>
          );
        }

        if (external && path) {
          return (
            <li key={key} className="text-inherit">
              <a
                href={path}
                target="_blank"
                rel="noopener noreferrer"
                className={[itemClasses, isActiveLeaf ? activeItemClass : ""].join(" ")}
              >
                <span className={iconWrapperClasses}>{icon}</span>
                {renderLabel(name)}
              </a>
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </li>
          );
        }

        if (path) {
          return (
            <li key={key} className="text-inherit">
              <Link href={path} className={[itemClasses, isActiveLeaf ? activeItemClass : ""].join(" ")}>
                <span className={iconWrapperClasses}>{icon}</span>
                {renderLabel(name)}
              </Link>
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </li>
          );
        }

        return null;
      })}
    </ul>
  );

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
        isCollapsed ? "w-16 max-w-[4rem]" : "w-full max-w-[18rem]"
      } p-1.5 shadow-blue-gray-900/5 ${
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
        {isCollapsed ? (
          <img src="/QIQI-Logo-cropped.svg" className="h-9 w-auto" alt="Qiqi logo" />
        ) : (
          <img src={brandImg} className="h-12 w-auto" alt="Qiqi logo" />
        )}
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
      {renderMenuItems(routes)}
    </Card>
  );
}
