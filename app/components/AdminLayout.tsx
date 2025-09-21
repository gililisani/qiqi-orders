'use client';

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
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
  Navbar,
  Spinner,
  Alert,
} from '../components/MaterialTailwind';
import {
  ChevronDownIcon,
  XMarkIcon,
  Bars3Icon,
  HomeIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  CubeIcon,
  ShoppingCartIcon,
  TagIcon,
  MapPinIcon,
  BanknotesIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const adminRoutes = [
  {
    name: 'Dashboard',
    path: '/admin',
    icon: <HomeIcon className="h-5 w-5" />,
  },
  {
    name: 'Orders',
    path: '/admin/orders',
    icon: <ShoppingCartIcon className="h-5 w-5" />,
  },
  {
    name: 'Products',
    path: '/admin/products',
    icon: <CubeIcon className="h-5 w-5" />,
    pages: [
      { name: 'All Products', path: '/admin/products' },
      { name: 'Add Product', path: '/admin/products/new' },
      { name: 'Bulk Upload', path: '/admin/products/bulk-upload' },
    ],
  },
  {
    name: 'Categories',
    path: '/admin/categories',
    icon: <TagIcon className="h-5 w-5" />,
    pages: [
      { name: 'All Categories', path: '/admin/categories' },
      { name: 'Add Category', path: '/admin/categories/new' },
      { name: 'Reorder', path: '/admin/categories/reorder' },
    ],
  },
  {
    name: 'Companies',
    path: '/admin/companies',
    icon: <BuildingOffice2Icon className="h-5 w-5" />,
    pages: [
      { name: 'All Companies', path: '/admin/companies' },
      { name: 'Add Company', path: '/admin/companies/new' },
    ],
  },
  {
    name: 'Users',
    path: '/admin/users',
    icon: <UserGroupIcon className="h-5 w-5" />,
    pages: [
      { name: 'All Users', path: '/admin/users' },
      { name: 'Add User', path: '/admin/users/new' },
    ],
  },
  {
    name: 'Admins',
    path: '/admin/admins',
    icon: <UserGroupIcon className="h-5 w-5" />,
    pages: [
      { name: 'All Admins', path: '/admin/admins' },
      { name: 'Add Admin', path: '/admin/admins/new' },
    ],
  },
  {
    name: 'Settings',
    icon: <Cog6ToothIcon className="h-5 w-5" />,
    pages: [
      { name: 'Locations', path: '/admin/locations' },
      { name: 'Payment Terms', path: '/admin/payment-terms' },
      { name: 'Incoterms', path: '/admin/incoterms' },
      { name: 'Subsidiaries', path: '/admin/subsidiaries' },
      { name: 'Support Funds', path: '/admin/support-funds' },
      { name: 'Classes', path: '/admin/classes' },
    ],
  },
  {
    name: 'NetSuite',
    path: '/admin/netsuite',
    icon: <DocumentTextIcon className="h-5 w-5" />,
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, error, isAdmin } = useAuth('Admin');
  const pathname = usePathname();
  const [openSidenav, setOpenSidenav] = React.useState(false);
  const [openCollapse, setOpenCollapse] = React.useState<string | null>(null);

  const handleOpenCollapse = (value: string) => {
    setOpenCollapse((cur) => (cur === value ? null : value));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-12 w-12" />
          <Typography variant="h6" color="blue-gray">
            Loading...
          </Typography>
        </div>
      </div>
    );
  }

  if (error || !isAdmin) {
    return (
      <div className="min-h-screen bg-blue-gray-50/50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Alert color="red" className="mb-4">
            {error || 'Access denied. Admin permissions required.'}
          </Alert>
          <Link href="/login">
            <Typography variant="small" color="blue" className="text-center underline">
              Return to Login
            </Typography>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-gray-50/50">
      {/* Sidebar */}
      <Card
        className={`fixed top-4 left-4 z-50 h-[calc(100vh-2rem)] w-full max-w-[18rem] p-4 shadow-xl transition-all duration-300 ease-in-out xl:left-4 ${
          openSidenav ? 'left-4' : '-left-72'
        }`}
      >
        <div className="mb-2 flex items-center gap-1 p-4">
          <Typography variant="h6" color="blue-gray">
            Qiqi Orders Admin
          </Typography>
        </div>
        <IconButton
          ripple={false}
          size="sm"
          variant="text"
          className="absolute top-1 right-1 block xl:hidden"
          onClick={() => setOpenSidenav(false)}
        >
          <XMarkIcon className="h-5 w-5" />
        </IconButton>
        <List className="overflow-y-auto">
          {adminRoutes.map(({ name, path, icon, pages }, key) =>
            pages ? (
              <Accordion
                key={key}
                open={openCollapse === name}
                icon={
                  <ChevronDownIcon
                    strokeWidth={2.5}
                    className={`mx-auto h-3 w-3 transition-transform ${
                      openCollapse === name ? 'rotate-180' : ''
                    }`}
                  />
                }
              >
                <ListItem className="p-0" selected={openCollapse === name}>
                  <AccordionHeader
                    onClick={() => handleOpenCollapse(name)}
                    className="border-b-0 p-3"
                  >
                    <ListItemPrefix>{icon}</ListItemPrefix>
                    <Typography color="blue-gray" className="mr-auto font-normal">
                      {name}
                    </Typography>
                  </AccordionHeader>
                </ListItem>
                <AccordionBody className="py-1">
                  <List className="p-0">
                    {pages.map((page: any, pageKey: number) => (
                      <Link href={page.path} key={pageKey}>
                        <ListItem
                          className={pathname === page.path ? 'bg-blue-500 text-white' : ''}
                        >
                          <ListItemPrefix>
                            <div className="h-3 w-3" />
                          </ListItemPrefix>
                          {page.name}
                        </ListItem>
                      </Link>
                    ))}
                  </List>
                </AccordionBody>
              </Accordion>
            ) : (
              <Link href={path!} key={key}>
                <ListItem className={pathname === path ? 'bg-blue-500 text-white' : ''}>
                  <ListItemPrefix>{icon}</ListItemPrefix>
                  {name}
                </ListItem>
              </Link>
            )
          )}
        </List>
      </Card>

      {/* Main Content */}
      <div className="p-4 xl:ml-80">
        {/* Top Navbar */}
        <Navbar
          className="sticky top-4 z-40 flex h-max max-w-full rounded-xl border border-white/80 bg-white/80 py-2 px-4 text-white shadow-md backdrop-blur-2xl backdrop-saturate-200"
          fullWidth
          blurred
        >
          <div className="flex items-center justify-between text-blue-gray-900">
            <div className="flex items-center gap-2">
              <IconButton
                ripple={false}
                size="sm"
                variant="text"
                className="block xl:hidden"
                onClick={() => setOpenSidenav(true)}
              >
                <Bars3Icon className="h-5 w-5" />
              </IconButton>
              <Typography
                as="a"
                href="#"
                className="mr-4 cursor-pointer py-1.5 font-medium"
              >
                Admin Dashboard
              </Typography>
            </div>
            <div className="flex items-center gap-2">
              <Typography variant="small" color="blue-gray">
                Welcome, {user?.email}
              </Typography>
            </div>
          </div>
        </Navbar>

        {/* Page Content */}
        <div className="mt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
