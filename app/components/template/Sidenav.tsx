/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// @material-tailwind/react
import { Card, Typography, IconButton } from "@material-tailwind/react";

// @heroicons/react
import { ChevronDownIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

// Context
import { useMaterialTailwindController, setOpenSidenav, setSidenavCollapsed } from "@/app/context";

// Styles
import styles from "./Sidenav.module.css";

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
  onHoverChange?: (isHovering: boolean) => void;
  isMobile?: boolean;
}

export default function Sidenav({
  brandImg = "/QIQI-Logo.svg",
  brandName,
  routes = [],
  onHoverChange,
  isMobile = false,
}: SidenavProps) {
  const pathname = usePathname();
  const [controller, dispatch] = useMaterialTailwindController();

  const { sidenavType, sidenavColor, openSidenav, sidenavCollapsed }: any = controller;

  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);
  const [openSubCollapse, setOpenSubCollapse] = React.useState<string | null>(null);
  const [isHovering, setIsHovering] = React.useState(false);

  // Gmail-like collapse model
  const [isExpanded, setIsExpanded] = React.useState<boolean>(() => !sidenavCollapsed);
  const [presentation, setPresentation] = React.useState<"full" | "compact">(
    !sidenavCollapsed ? "full" : "compact",
  );
  const [isAnimating, setIsAnimating] = React.useState(false);
  
  // Peek state: hover-open when collapsed (temporary visual expansion)
  const [isPeekOpen, setIsPeekOpen] = React.useState(false);

  const sidenavRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // On mobile, sidebar should never be collapsed when open
  // openSidenav is only used on mobile, so if it's true, we're on mobile
  // Also check window width as fallback
  const [isMobileView, setIsMobileView] = React.useState(false);
  
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 1280);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleClickOutside = () => {
    setOpenSidenav(dispatch, false);
  };

  const handleMouseEnter = React.useCallback(() => {
    // Only expand on hover if collapsed and on desktop (not mobile)
    // Add small buffer to prevent expansion near breakpoint
    const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1320;
    if (sidenavCollapsed && isDesktop && !openSidenav) {
      setIsHovering(true);
      setIsPeekOpen(true);
      onHoverChange?.(true);
    }
  }, [sidenavCollapsed, openSidenav, onHoverChange]);

  const handleMouseLeave = React.useCallback(() => {
    // Always reset hovering on leave
    setIsHovering(false);
    setIsPeekOpen(false);
    onHoverChange?.(false);
  }, [onHoverChange]);

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
  
  // Sync Gmail-style animation model with controller state
  React.useEffect(() => {
    const targetExpanded = !sidenavCollapsed;
    if (targetExpanded === isExpanded) return;

    // Guard against spamming during animation – ignore rapid flips
    if (isAnimating) return;

    setIsAnimating(true);

    if (targetExpanded) {
      // Rail -> Full: start width expansion but keep compact presentation
      setIsExpanded(true);
      setPresentation("compact");
    } else {
      // Full -> Rail: start width shrink but keep full presentation
      setIsExpanded(false);
      setPresentation("full");
    }
  }, [sidenavCollapsed, isExpanded, isAnimating]);

  const handleTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (!isAnimating) return;

    // Only react to width / flex-basis related transitions
    if (
      event.propertyName !== "width" &&
      event.propertyName !== "flex-basis" &&
      event.propertyName !== "max-width"
    ) {
      return;
    }

    setIsAnimating(false);
    // When the width animation completes, swap presentation
    setPresentation(isExpanded ? "full" : "compact");
  };

  // On mobile, never collapse. On desktop, use Gmail-like presentation state with hover
  const isCollapsed =
    isMobileView || openSidenav ? false : presentation === "compact" && !isHovering;
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
  
  // Compute visual expansion state: expanded via click OR peek via hover
  const isVisuallyExpanded = isExpanded || isPeekOpen;
  
  // Presentation: use full when visually expanded, compact otherwise
  const isPresentationCompact = !isVisuallyExpanded;
  
  // Helper to determine if we should use compact presentation
  const shouldUseCompact = (forceFull: boolean) => forceFull ? false : isPresentationCompact;
  
  // Overlay mode: when collapsed but peek is open, sidebar becomes overlay
  const isOverlayMode = !isExpanded && isPeekOpen && !isMobileView;

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


  const renderMenuItems = (items: Route[], level = 0) => {
    // Helper function to check if a route is the most specific active match
    // This prevents parent routes from being highlighted when a child route matches
    const isMostSpecificActive = (routePath: string | undefined, routePages: Route[] | undefined): boolean => {
      if (!routePath) return false;
      
      // Exact match is always active
      if (pathname === routePath) return true;
      
      // For Dashboard, only exact match
      if (routePath === "/admin" || routePath === "/client") {
        return pathname === routePath;
      }
      
      // Check if pathname starts with this route
      if (!pathname.startsWith(`${routePath}/`)) return false;
      
      // If this route has children, check if any child route matches exactly
      // If a child matches exactly, this parent should not be highlighted
      if (routePages && routePages.length > 0) {
        const hasExactChildMatch = routePages.some(child => 
          child.path && pathname === child.path
        );
        if (hasExactChildMatch) return false;
      }
      
      // Check if any sibling route (routes at the same level) matches exactly
      // If a sibling matches exactly, this route should not be highlighted
      const siblingRoutes = items.map(item => item.path);
      const hasExactSiblingMatch = siblingRoutes.some(siblingPath => 
        siblingPath && siblingPath !== routePath && pathname === siblingPath
      );
      if (hasExactSiblingMatch) return false;
      
      // Otherwise, it's active if pathname starts with the route path
      return true;
    };
    
    return (
    <ul className={`flex flex-col gap-1 ${level === 0 ? "" : "mt-1"}`}>
      {items.map(({ name, icon, pages, title, divider, external, path }, index) => {
        const key = `${name}-${index}`;
        const hasChildren = Array.isArray(pages) && pages.length > 0;
        // Check if this route is active (only if it's the most specific match)
        const isActiveLeaf = !hasChildren && path ? isMostSpecificActive(path, pages) : false;
        const isOpen = level === 0 ? openCollapse === name : openSubCollapse === name;

        const itemBaseClasses = [
          "group relative flex items-center w-full min-h-[44px] rounded-lg transition-all duration-300 ease-in-out overflow-hidden text-inherit active:scale-[0.98]",
          // Only add hover class if item is not active (active items should keep gradient, hover can slightly darken it)
          isActiveLeaf ? "" : hoverBackgroundClass,
          "px-3 justify-start",
          // Gap between icon and label - icons stay fixed, labels slide
          "gap-3",
          "focus:outline-none focus-visible:outline-none",
        ];
        
        // Icons always stay in the same position - left-aligned with consistent padding
        // Never use absolute positioning - icons are part of flex flow
        const iconWrapperStyle: React.CSSProperties = {
          width: '20px',
          height: '20px',
          flexShrink: 0,
          transition: 'none',
        };

        // Add active item classes if this is the active route
        if (isActiveLeaf) {
          itemBaseClasses.push(activeItemClass);
          // Add a subtle hover effect for active items (slightly darker gradient)
          itemBaseClasses.push("hover:opacity-90");
        }

        const iconWrapperClasses = "flex-shrink-0 flex items-center justify-center h-5 w-5 text-inherit";

        // Labels slide in/out from the right while icons stay fixed
        // When collapsed: labels are hidden but don't affect icon position
        // When expanded: labels reveal from the right
        const useCompact = isPresentationCompact;
        const labelVisibilityClasses = [
          styles.labelVisibility,
          useCompact ? styles.labelHidden : styles.labelVisible,
        ].join(" ");

        const chevronClasses = [
          "flex-shrink-0 h-3 w-3 transition-transform duration-300",
          isOpen ? "rotate-180" : "",
          useCompact ? "opacity-0 invisible" : "ml-auto opacity-100",
        ].join(" ");

        const itemClasses = itemBaseClasses.join(" ");

        const renderLabel = (text: string) => (
          <span className={labelVisibilityClasses}>{text}</span>
        );

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
                // Tooltip in compact mode
                title={useCompact ? name : undefined}
              >
                <span
                  className={[
                    styles.navItemInnerBase,
                    level > 0 ? styles.navItemInnerIndented : "",
                    !useCompact ? styles.navItemInnerSpaced : "",
                  ].join(" ")}
                >
                  <span className={iconWrapperClasses} style={iconWrapperStyle}>
                    {icon}
                  </span>
                  {renderLabel(name)}
                </span>
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
                className={itemClasses}
                title={useCompact ? name : undefined}
              >
                <span
                  className={[
                    styles.navItemInnerBase,
                    level > 0 ? styles.navItemInnerIndented : "",
                    !useCompact ? styles.navItemInnerSpaced : "",
                  ].join(" ")}
                >
                  <span className={iconWrapperClasses} style={iconWrapperStyle}>
                    {icon}
                  </span>
                  {renderLabel(name)}
                </span>
              </a>
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </li>
          );
        }

        if (path) {
          return (
            <li key={key} className="text-inherit">
              <Link
                href={path}
                className={itemClasses}
                title={useCompact ? name : undefined}
              >
                <span
                  className={[
                    styles.navItemInnerBase,
                    level > 0 ? styles.navItemInnerIndented : "",
                    !useCompact ? styles.navItemInnerSpaced : "",
                  ].join(" ")}
                >
                  <span className={iconWrapperClasses} style={iconWrapperStyle}>
                    {icon}
                  </span>
                  {renderLabel(name)}
                </span>
              </Link>
              {divider && <hr className="my-2 border-blue-gray-50" />}
            </li>
          );
        }

        return null;
      })}
    </ul>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={[
        isMobile ? "h-full w-full" : "h-[calc(100%-1rem)] ml-4 mb-4",
        styles.sidebarContainer,
        isMobile ? styles.sidebarMobile : styles.sidebarDesktop,
        isExpanded ? styles.sidebarExpanded : styles.sidebarCollapsed,
        isPresentationCompact ? styles.sidebarCompact : styles.sidebarFull,
        isAnimating ? styles.sidebarAnimating : "",
      ].join(" ")}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTransitionEnd={handleTransitionEnd}
    >
      {/* Single sidebar panel - becomes overlay when peek is open */}
      <Card
        ref={sidenavRef}
        color={
          sidenavType === "dark"
            ? "gray"
            : sidenavType === "transparent"
            ? "transparent"
            : "white"
        }
        shadow={false}
        variant="gradient"
        className={`h-full w-full transition-all duration-300 ease-in-out p-1.5 border border-gray-200 ${
          sidenavType === "transparent" ? "shadow-none border-none" : "shadow-sm"
        } ${
          sidenavType === "dark" ? "!text-white" : "text-gray-900"
        } overflow-y-auto ${isOverlayMode ? styles.sidebarOverlayCard : ""}`}
        placeholder={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeaveCapture={undefined}
      >
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

        {/* Menu Items - uses isVisuallyExpanded for presentation */}
        {renderMenuItems(routes)}
      </Card>
    </div>
  );
}
