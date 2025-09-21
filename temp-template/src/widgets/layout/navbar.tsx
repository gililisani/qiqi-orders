import React from "react";

import Link from "next/link";

// @material-tailwind/react
import {
  Navbar as MTNavbar,
  Collapse,
  Typography,
  Button,
  IconButton,
  List,
  Menu,
  MenuHandler,
  MenuList,
  MenuItem,
} from "@material-tailwind/react";

// @heroicons/react
import {
  ChevronDownIcon,
  Bars3Icon,
  XMarkIcon,
  Squares2X2Icon,
  ListBulletIcon,
  CogIcon,
  ClipboardIcon,
  ArrowRightOnRectangleIcon,
  ArrowPathIcon,
  BookOpenIcon,
  CalendarIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
  PuzzlePieceIcon,
  RectangleGroupIcon,
  ShoppingCartIcon,
  TableCellsIcon,
  TagIcon,
  CurrencyDollarIcon,
  BanknotesIcon,
  BellAlertIcon,
  UserCircleIcon,
} from "@heroicons/react/24/solid";
import {
  ChartBarSquareIcon,
  Cog8ToothIcon,
  DocumentTextIcon,
  IdentificationIcon,
  QueueListIcon,
  Square3Stack3DIcon,
} from "@heroicons/react/24/outline";

const pagesMenuItems = [
  {
    title: "Analytics",
    description: "Find the perfect solution for your needs.",
    icon: RectangleGroupIcon,
    path: "/dashboard/analytics",
  },
  {
    title: "Sales",
    description: "Meet and learn about our dedication",
    icon: CurrencyDollarIcon,
    path: "/dashboard/sales",
  },
  {
    title: "Pricing",
    description: "Learn how we can help you achieve your goals.",
    icon: BanknotesIcon,
    path: "/pages/pricing-page",
  },
  {
    title: "Widgets",
    description: "Reach out to us for assistance or inquiries",
    icon: Square3Stack3DIcon,
    path: "/pages/widgets",
  },
  {
    title: "Charts",
    description: "Find the perfect solution for your needs.",
    icon: ChartBarSquareIcon,
    path: "/pages/charts",
  },
  {
    title: "Notifications",
    description: "Read insightful articles, tips, and expert opinions.",
    icon: BellAlertIcon,
    path: "/pages/notifications",
  },
  {
    title: "Timeline",
    description: "Find the perfect solution for your needs.",
    icon: QueueListIcon,
    path: "/pages/projects/timeline-page",
  },
  {
    title: "Settings",
    description: "Explore limited-time deals and bundles",
    icon: Cog8ToothIcon,
    path: "/pages/account/settings",
  },
  {
    title: "Billing",
    description: "Explore limited-time deals and bundles",
    icon: TagIcon,
    path: "/pages/account/billing",
  },
  {
    title: "Invoice",
    description: "Explore limited-time deals and bundles",
    icon: IdentificationIcon,
    path: "/pages/account/invoice",
  },
  {
    title: "Profile Overview",
    description: "Explore limited-time deals and bundles",
    icon: UserCircleIcon,
    path: "/pages/profile/profile-overview",
  },
  {
    title: "All projects",
    description: "Explore limited-time deals and bundles",
    icon: DocumentTextIcon,
    path: "/pages/profile/all-projects",
  },
];

function PagesMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const renderItems = pagesMenuItems.map(
    ({ icon: Icon, title, description, path }, key) => (
      <Link href={path} key={key}>
        <MenuItem className="tw-flex tw-items-center tw-gap-3 tw-rounded-lg">
          <div className="tw-flex tw-items-center tw-justify-center tw-rounded-lg !tw-bg-blue-gray-50 tw-p-2">
            <Icon className="tw-h-6 tw-w-6 tw-text-gray-900 tw-stroke-2" />
          </div>
          <div>
            <Typography
              variant="h6"
              color="blue-gray"
              className="tw-flex tw-items-center tw-text-sm !tw-font-bold"
            >
              {title}
            </Typography>
            <Typography
              variant="paragraph"
              className="tw-text-xs !tw-font-medium !tw-text-blue-gray-500"
            >
              {description}
            </Typography>
          </div>
        </MenuItem>
      </Link>
    )
  );

  return (
    <React.Fragment>
      <Menu
        open={isMenuOpen}
        handler={setIsMenuOpen}
        placement="bottom"
        allowHover={true}
      >
        <MenuHandler>
          <Typography
            as="div"
            variant="small"
            className="!tw-font-medium lg:tw-text-white tw-text-gray-900 lg:tw-w-max tw-w-full"
          >
            <li
              className="tw-w-full tw-justify-between tw-flex cursor-pointer tw-items-center tw-gap-2 tw-py-2 !tw-font-medium hover:tw-bg-transparent"
              onClick={() => setIsMobileMenuOpen((cur) => !cur)}
            >
              Pages
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-hidden tw-h-3 tw-w-3 tw-transition-transform lg:tw-block ${
                  isMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-block tw-h-3 tw-w-3 tw-transition-transform lg:tw-hidden ${
                  isMobileMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
            </li>
          </Typography>
        </MenuHandler>
        <MenuList className="tw-hidden tw-max-w-screen-xl tw-rounded-xl lg:tw-block">
          <ul className="tw-grid tw-grid-cols-3 tw-gap-y-2 tw-outline-none tw-outline-0">
            {renderItems}
          </ul>
        </MenuList>
      </Menu>
      <div className="tw-block lg:tw-hidden">
        <Collapse open={isMobileMenuOpen}>{renderItems}</Collapse>
      </div>
    </React.Fragment>
  );
}

const applicationMenuItems = [
  {
    title: "Wizard",
    path: "/applications/wizard",
    icon: BookOpenIcon,
  },
  {
    title: "Data Tables",
    path: "/applications/data-tables",
    icon: TableCellsIcon,
  },
  {
    title: "Calendar",
    path: "/applications/calendar",
    icon: CalendarIcon,
  },
];

function ApplicationMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const renderItems = applicationMenuItems.map(
    ({ icon: Icon, title, path }, key) => (
      <Link href={path} key={key}>
        <MenuItem className="tw-flex tw-items-center tw-gap-2">
          <Icon className="tw-h-4 tw-w-4 tw-text-gray-900" />
          {title}
        </MenuItem>
      </Link>
    )
  );

  return (
    <React.Fragment>
      <Menu
        open={isMenuOpen}
        handler={setIsMenuOpen}
        placement="bottom"
        allowHover={true}
      >
        <MenuHandler>
          <Typography
            as="div"
            variant="small"
            className="w-full tw-font-medium lg:tw-w-max"
          >
            <li
              className="tw-flex tw-justify-between tw-cursor-pointer tw-items-center tw-gap-2 tw-py-2 !tw-font-medium lg:tw-text-white tw-text-gray-900 hover:tw-bg-transparent"
              onClick={() => setIsMobileMenuOpen((cur) => !cur)}
            >
              Application
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-hidden tw-h-3 tw-w-3 tw-transition-transform lg:tw-block ${
                  isMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-block tw-h-3 tw-w-3 tw-transition-transform lg:tw-hidden ${
                  isMobileMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
            </li>
          </Typography>
        </MenuHandler>
        <MenuList className="tw-rounded-xl lg:tw-block tw-hidden">
          {renderItems}
        </MenuList>
      </Menu>
      <div className="tw-block lg:tw-hidden">
        <Collapse open={isMobileMenuOpen}>{renderItems}</Collapse>
      </div>
    </React.Fragment>
  );
}

const authMenuItems = [
  {
    title: "Sign In",
    path: "/auth/signin/basic",
    icon: ArrowRightOnRectangleIcon,
  },
  {
    title: "Sign Up",
    path: "/auth/signup/basic-signup",
    icon: ClipboardIcon,
  },
  {
    title: "Reset",
    path: "/auth/reset/basic-reset",
    icon: ArrowPathIcon,
  },
];

function AuthMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const renderItems = authMenuItems.map(({ icon: Icon, title, path }, key) => (
    <Link href={path} key={key}>
      <MenuItem className="tw-flex tw-items-center tw-gap-2">
        <Icon className="tw-h-4 tw-w-4 tw-text-gray-900" />
        {title}
      </MenuItem>
    </Link>
  ));

  return (
    <React.Fragment>
      <Menu
        open={isMenuOpen}
        handler={setIsMenuOpen}
        placement="bottom"
        allowHover={true}
      >
        <MenuHandler>
          <Typography
            as="div"
            variant="small"
            className="tw-font-medium lg:tw-w-max tw-w-full"
          >
            <li
              className="tw-flex tw-justify-between tw-cursor-pointer tw-items-center tw-gap-2 tw-py-2 !tw-font-medium lg:tw-text-white tw-text-gray-900 hover:tw-bg-transparent"
              onClick={() => setIsMobileMenuOpen((cur) => !cur)}
            >
              Authentication
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-hidden tw-h-3 tw-w-3 tw-transition-transform lg:tw-block ${
                  isMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-block tw-h-3 tw-w-3 tw-transition-transform lg:tw-hidden ${
                  isMobileMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
            </li>
          </Typography>
        </MenuHandler>
        <MenuList className="tw-rounded-xl tw-hidden lg:tw-block">
          {renderItems}
        </MenuList>
      </Menu>
      <div className="tw-block lg:tw-hidden">
        <Collapse open={isMobileMenuOpen}>{renderItems}</Collapse>
      </div>
    </React.Fragment>
  );
}

const ecommerceMenuItems = [
  {
    title: "Orders List",
    description: "Find the perfect solution for your needs.",
    icon: ListBulletIcon,
    path: "/ecommerce/order-list",
  },
  {
    title: "Order Details",
    description: "Meet and learn about our dedication",
    icon: ShoppingCartIcon,
    path: "/ecommerce/order-details",
  },
  {
    title: "New Product",
    description: "Find the perfect solution for your needs.",
    icon: CogIcon,
    path: "/ecommerce/products/new-product",
  },
  {
    title: "Edit Product",
    description: "Learn how we can help you achieve your goals.",
    icon: PencilSquareIcon,
    path: "/ecommerce/products/edit-product",
  },
  {
    title: "Product Page",
    description: "Reach out to us for assistance or inquiries",
    icon: ClipboardIcon,
    path: "/ecommerce/products/product-page",
  },
];

function EcommerceMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const renderItems = ecommerceMenuItems.map(
    ({ icon: Icon, title, description, path }, key) => (
      <Link href={path} key={key}>
        <MenuItem className="tw-flex tw-items-center tw-gap-3 tw-rounded-lg">
          <div className="tw-flex tw-items-center tw-justify-center tw-rounded-lg !tw-bg-blue-gray-50 tw-p-2 ">
            <Icon className="tw-h-6 tw-w-6 tw-text-gray-900 tw-stroke-2" />
          </div>
          <div>
            <Typography
              variant="h6"
              color="blue-gray"
              className="tw-flex tw-items-center tw-text-sm !tw-font-bold"
            >
              {title}
            </Typography>
            <Typography
              variant="paragraph"
              className="tw-text-xs !tw-font-medium !tw-text-blue-gray-500"
            >
              {description}
            </Typography>
          </div>
        </MenuItem>
      </Link>
    )
  );

  return (
    <React.Fragment>
      <Menu
        open={isMenuOpen}
        handler={setIsMenuOpen}
        placement="bottom"
        allowHover={true}
      >
        <MenuHandler>
          <Typography as="div" variant="small" className="font-medium">
            <li
              className="tw-flex tw-justify-between tw-cursor-pointer tw-items-center tw-gap-2 tw-py-2 tw-font-medium lg:tw-text-white tw-text-gray-900 hover:tw-bg-transparent"
              onClick={() => setIsMobileMenuOpen((cur) => !cur)}
            >
              Ecommerce
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-hidden tw-h-3 tw-w-3 tw-transition-transform lg:tw-block ${
                  isMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-block tw-h-3 tw-w-3 tw-transition-transform lg:tw-hidden ${
                  isMobileMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
            </li>
          </Typography>
        </MenuHandler>
        <MenuList className="tw-hidden tw-max-w-screen-xl tw-rounded-xl lg:tw-block">
          <ul className="tw-grid tw-grid-cols-2 tw-gap-y-2 tw-outline-none tw-outline-0">
            {renderItems}
          </ul>
        </MenuList>
      </Menu>
      <div className="tw-block lg:tw-hidden">
        <Collapse open={isMobileMenuOpen}>{renderItems}</Collapse>
      </div>
    </React.Fragment>
  );
}

const docsMenuItems = [
  {
    title: "Getting Started",
    icon: ClipboardDocumentIcon,
    path: "https://www.material-tailwind.com/docs/react/installation",
    description: "All about overview, quick start, licence and contents",
  },
  {
    title: "Foundation",
    icon: ListBulletIcon,
    path: "https://www.material-tailwind.com/docs/react/theming",
    description: "See our colors, icons and typography",
  },
  {
    title: "Components",
    icon: Squares2X2Icon,
    path: "https://www.material-tailwind.com/docs/react/accordion",
    description: "Explore our collection of fully designed components",
  },
  {
    title: "Plugins",
    icon: PuzzlePieceIcon,
    path: "https://www.material-tailwind.com/docs/react/license",
    description: "Check how you can integrate our plugins",
  },
];

function DocsMenu() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const renderItems = docsMenuItems.map(
    ({ icon: Icon, title, description, path }, key) => (
      <MenuItem
        className="tw-flex tw-items-start tw-gap-3 tw-rounded-lg"
        key={key}
      >
        <div className="tw-flex tw-items-center tw-justify-center tw-rounded-lg !tw-bg-blue-gray-50 tw-p-2">
          <Icon className="tw-h-6 tw-w-6 tw-text-gray-900 tw-stroke-2" />
        </div>
        <Link href={path} key={key} target="_blank">
          <Typography variant="h6" color="blue-gray" className="tw-mb-1">
            {title}
          </Typography>
          <Typography variant="small" color="gray" className="tw-font-normal">
            {description}
          </Typography>
        </Link>
      </MenuItem>
    )
  );

  return (
    <React.Fragment>
      <Menu allowHover open={isMenuOpen} handler={setIsMenuOpen}>
        <MenuHandler>
          <Typography
            as="div"
            variant="small"
            className="tw-font-medium lg:tw-w-max tw-w-full"
          >
            <li
              className="tw-flex tw-justify-between tw-cursor-pointer tw-items-center tw-gap-2 tw-py-2 tw-font-medium lg:tw-text-white tw-text-gray-900 hover:tw-bg-transparent"
              onClick={() => setIsMobileMenuOpen((cur) => !cur)}
            >
              Docs
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-hidden tw-h-3 tw-w-3 tw-transition-transform lg:tw-block ${
                  isMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
              <ChevronDownIcon
                strokeWidth={2.5}
                className={`tw-block tw-h-3 tw-w-3 tw-transition-transform lg:tw-hidden ${
                  isMobileMenuOpen ? "tw-rotate-180" : ""
                }`}
              />
            </li>
          </Typography>
        </MenuHandler>
        <MenuList className="tw-hidden tw-w-[26rem] tw-gap-3 tw-overflow-visible lg:tw-grid">
          <ul className="tw-col-span-4 tw-flex tw-w-full tw-flex-col tw-gap-1">
            {renderItems}
          </ul>
        </MenuList>
      </Menu>
      <div className="tw-block lg:tw-hidden">
        <Collapse open={isMobileMenuOpen}>{renderItems}</Collapse>
      </div>
    </React.Fragment>
  );
}

function NavList() {
  return (
    <List className="tw-mt-4 tw-mb-6 tw-p-0 lg:tw-mt-0 lg:tw-mb-0 lg:tw-flex-row lg:tw-p-1 lg:tw-gap-6">
      <PagesMenu />
      <AuthMenu />
      <ApplicationMenu />
      <EcommerceMenu />
      <DocsMenu />
    </List>
  );
}

export function Navbar() {
  const [openNav, setOpenNav] = React.useState(false);

  React.useEffect(() => {
    window.addEventListener(
      "resize",
      () => window.innerWidth >= 960 && setOpenNav(false)
    );
  }, []);

  return (
    <MTNavbar color="transparent" shadow={false} className="tw-absolute">
      <div className="tw-flex tw-items-center tw-justify-between">
        <Typography
          as={Link}
          href="/dashboard/analytics"
          variant="h6"
          className="tw-cursor-pointer tw-py-1.5"
        >
          Material Tailwind PRO
        </Typography>
        <div className="tw-hidden lg:tw-block">
          <NavList />
        </div>
        <div className="tw-hidden lg:tw-flex">
          <a href="https://material-tailwind.com/blocks" target="_blank">
            <Button color="white" size="sm">
              Blocks
            </Button>
          </a>
        </div>
        <IconButton
          variant="text"
          color="white"
          className="lg:tw-hidden"
          onClick={() => setOpenNav(!openNav)}
        >
          {openNav ? (
            <XMarkIcon className="tw-h-6 tw-w-6" strokeWidth={2} />
          ) : (
            <Bars3Icon className="tw-h-6 tw-w-6" strokeWidth={2} />
          )}
        </IconButton>
      </div>
      <Collapse open={openNav}>
        <div className="tw-container tw-mx-auto tw-rounded-lg tw-bg-white tw-px-6 tw-pt-1 tw-pb-5">
          <NavList />
          <div className="tw-block lg:tw-hidden">
            <a href="https://material-tailwind.com/blocks" target="_blank">
              <Button color="gray" size="sm">
                Blocks
              </Button>
            </a>
          </div>
        </div>
      </Collapse>
    </MTNavbar>
  );
}
