'use client';

import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Typography,
  IconButton,
  Navbar,
  Spinner,
  Alert,
} from '../components/MaterialTailwind';
import { useMaterialTailwindController, setOpenSidenav } from '../context';
import {
  XMarkIcon,
  Bars3Icon,
  HomeIcon,
  UserGroupIcon,
  BuildingOffice2Icon,
  CubeIcon,
  ShoppingCartIcon,
  TagIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';

interface AdminLayoutProps {
  children: React.ReactNode;
}

const adminRoutes = [
  {
    layout: 'admin',
    title: 'Dashboard',
    pages: [
      {
        name: 'Dashboard',
        path: '',
        icon: <HomeIcon className="h-5 w-5" />,
      },
      {
        name: 'Orders',
        path: '/orders',
        icon: <ShoppingCartIcon className="h-5 w-5" />,
      },
    ],
  },
  {
    layout: 'admin',
    title: 'Management',
    pages: [
      {
        name: 'Products',
        path: '/products',
        icon: <CubeIcon className="h-5 w-5" />,
      },
      {
        name: 'Categories',
        path: '/categories',
        icon: <TagIcon className="h-5 w-5" />,
      },
      {
        name: 'Companies',
        path: '/companies',
        icon: <BuildingOffice2Icon className="h-5 w-5" />,
      },
      {
        name: 'Users',
        path: '/users',
        icon: <UserGroupIcon className="h-5 w-5" />,
      },
      {
        name: 'Admins',
        path: '/admins',
        icon: <UserGroupIcon className="h-5 w-5" />,
      },
    ],
  },
  {
    layout: 'admin',
    title: 'Settings',
    pages: [
      {
        name: 'NetSuite',
        path: '/netsuite',
        icon: <DocumentTextIcon className="h-5 w-5" />,
      },
      {
        name: 'Configuration',
        path: '/locations',
        icon: <Cog6ToothIcon className="h-5 w-5" />,
      },
    ],
  },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, loading, error, isAdmin, logout } = useAuth('Admin');
  const pathname = usePathname();
  const router = useRouter();
  const [controller, dispatch] = useMaterialTailwindController();
  const { sidenavColor, sidenavType, openSidenav } = controller;
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [openPartners, setOpenPartners] = React.useState(false);
  const [openProducts, setOpenProducts] = React.useState(false);
  const [openSystem, setOpenSystem] = React.useState(false);

  // Handle navigation loading with pathname changes
  React.useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  const handleNavigation = (href: string) => {
    setIsNavigating(true);
    router.push(href);
  };

  // Auto-open correct submenu based on current path
  React.useEffect(() => {
    const p = pathname || '';
    setOpenPartners(p.startsWith('/admin/companies') || p.startsWith('/admin/users'));
    setOpenProducts(p.startsWith('/admin/products') || p.startsWith('/admin/categories'));
    setOpenSystem(
      p.startsWith('/admin/support-funds') ||
      p.startsWith('/admin/locations') ||
      p.startsWith('/admin/classes') ||
      p.startsWith('/admin/subsidiaries') ||
      p.startsWith('/admin/incoterms') ||
      p.startsWith('/admin/payment-terms') ||
      p.startsWith('/admin/admins') ||
      p.startsWith('/admin/netsuite')
    );
  }, [pathname]);

  // Template2's sidebar types - exactly like the demo
  const sidenavTypes: { [key: string]: string } = {
    dark: "bg-gradient-to-br from-gray-800 to-gray-900",
    white: "bg-white shadow-sm",
    transparent: "bg-transparent",
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
      {/* Sidebar - Template2 Style */}
      <aside
        className={`${sidenavTypes[sidenavType]} ${
          openSidenav ? "translate-x-0" : "-translate-x-80"
        } fixed inset-0 z-50 my-4 ml-4 h-[calc(100vh-32px)] w-72 rounded-xl transition-transform duration-300 xl:translate-x-0 border border-blue-gray-100`}
      >
        <div className="relative">
          <Link href="/admin" className="py-6 px-8 text-center flex flex-col items-center gap-2">
            <img src="/QIQI-Logo.svg" className="h-12 w-auto" alt="logo" />
          </Link>
          <IconButton
            variant="text"
            color={sidenavType === "dark" ? "white" : "blue-gray"}
            size="sm"
            ripple={false}
            className="absolute right-2 top-2 xl:hidden z-50"
            onClick={() => setOpenSidenav(dispatch, false)}
          >
            <XMarkIcon strokeWidth={2.5} className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="m-4">
          <ul className="flex flex-col gap-1">
            {/* 1. Dashboard */}
            <li>
              <Button
                variant={pathname === '/admin' ? 'gradient' : 'text'}
                color={pathname === '/admin' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                className="flex items-center gap-4 px-4 capitalize"
                fullWidth
                onClick={() => handleNavigation('/admin')}
              >
                <HomeIcon className="h-5 w-5" />
                <Typography color="inherit" className="font-medium capitalize">Dashboard</Typography>
              </Button>
            </li>

            {/* 2. Orders */}
            <li>
              <Button
                variant={pathname === '/admin/orders' ? 'gradient' : 'text'}
                color={pathname === '/admin/orders' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                className="flex items-center gap-4 px-4 capitalize"
                fullWidth
                onClick={() => handleNavigation('/admin/orders')}
              >
                <ShoppingCartIcon className="h-5 w-5" />
                <Typography color="inherit" className="font-medium capitalize">Orders</Typography>
              </Button>
            </li>

            {/* 3. Partners (submenu) */}
            <li>
              <Button
                variant="text"
                color={sidenavType === 'dark' ? 'white' : 'blue-gray'}
                className="flex items-center justify-between px-4"
                fullWidth
                onClick={() => setOpenPartners(v => !v)}
              >
                <span className="flex items-center gap-4">
                  <BuildingOffice2Icon className="h-5 w-5" />
                  <Typography color="inherit" className="font-medium capitalize">Partners</Typography>
                </span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform duration-300 ${openPartners ? 'rotate-180' : ''}`} />
              </Button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openPartners ? 'max-h-40' : 'max-h-0'}`}>
                <div className="pl-10 py-1 flex flex-col gap-1">
                  <Button
                    variant={pathname === '/admin/companies' ? 'gradient' : 'text'}
                    color={pathname === '/admin/companies' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                    className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md"
                    fullWidth
                    onClick={() => handleNavigation('/admin/companies')}
                  >
                    Companies
                  </Button>
                  <Button
                    variant={pathname === '/admin/users' ? 'gradient' : 'text'}
                    color={pathname === '/admin/users' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                    className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md"
                    fullWidth
                    onClick={() => handleNavigation('/admin/users')}
                  >
                    Users
                  </Button>
                </div>
              </div>
            </li>

            {/* 4. Products (submenu) */}
            <li>
              <Button
                variant="text"
                color={sidenavType === 'dark' ? 'white' : 'blue-gray'}
                className="flex items-center justify-between px-4"
                fullWidth
                onClick={() => setOpenProducts(v => !v)}
              >
                <span className="flex items-center gap-4">
                  <CubeIcon className="h-5 w-5" />
                  <Typography color="inherit" className="font-medium capitalize">Products</Typography>
                </span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform duration-300 ${openProducts ? 'rotate-180' : ''}`} />
              </Button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openProducts ? 'max-h-40' : 'max-h-0'}`}>
                <div className="pl-10 py-1 flex flex-col gap-1">
                  <Button
                    variant={pathname === '/admin/products' ? 'gradient' : 'text'}
                    color={pathname === '/admin/products' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                    className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md"
                    fullWidth
                    onClick={() => handleNavigation('/admin/products')}
                  >
                    Products
                  </Button>
                  <Button
                    variant={pathname === '/admin/categories' ? 'gradient' : 'text'}
                    color={pathname === '/admin/categories' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')}
                    className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md"
                    fullWidth
                    onClick={() => handleNavigation('/admin/categories')}
                  >
                    Categories
                  </Button>
                </div>
              </div>
            </li>

            {/* 5. System (submenu) */}
            <li>
              <Button
                variant="text"
                color={sidenavType === 'dark' ? 'white' : 'blue-gray'}
                className="flex items-center justify-between px-4"
                fullWidth
                onClick={() => setOpenSystem(v => !v)}
              >
                <span className="flex items-center gap-4">
                  <Cog6ToothIcon className="h-5 w-5" />
                  <Typography color="inherit" className="font-medium capitalize">System</Typography>
                </span>
                <ChevronDownIcon className={`h-4 w-4 transition-transform duration-300 ${openSystem ? 'rotate-180' : ''}`} />
              </Button>
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${openSystem ? 'max-h-96' : 'max-h-0'}`}>
                <div className="pl-10 py-1 grid gap-1">
                  <Button variant={pathname === '/admin/support-funds' ? 'gradient' : 'text'} color={pathname === '/admin/support-funds' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/support-funds')}>Support Funds</Button>
                  <Button variant={pathname === '/admin/locations' ? 'gradient' : 'text'} color={pathname === '/admin/locations' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/locations')}>Locations</Button>
                  <Button variant={pathname === '/admin/classes' ? 'gradient' : 'text'} color={pathname === '/admin/classes' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/classes')}>Classes</Button>
                  <Button variant={pathname === '/admin/subsidiaries' ? 'gradient' : 'text'} color={pathname === '/admin/subsidiaries' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/subsidiaries')}>Subsidiaries</Button>
                  <Button variant={pathname === '/admin/incoterms' ? 'gradient' : 'text'} color={pathname === '/admin/incoterms' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/incoterms')}>Incoterms</Button>
                  <Button variant={pathname === '/admin/payment-terms' ? 'gradient' : 'text'} color={pathname === '/admin/payment-terms' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/payment-terms')}>Payment Terms</Button>
                  <Button variant={pathname === '/admin/admins' ? 'gradient' : 'text'} color={pathname === '/admin/admins' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/admins')}>Admins</Button>
                  <Button variant={pathname === '/admin/netsuite' ? 'gradient' : 'text'} color={pathname === '/admin/netsuite' ? sidenavColor : (sidenavType === 'dark' ? 'white' : 'blue-gray')} className="justify-start px-3 hover:bg-blue-gray-50/50 rounded-md" fullWidth onClick={() => handleNavigation('/admin/netsuite')}>NetSuite</Button>
                </div>
              </div>
            </li>

            {/* 6. Media (coming soon) */}
            <li>
              <Button
                variant="text"
                color={sidenavType === 'dark' ? 'white' : 'blue-gray'}
                className="flex items-center gap-4 px-4 capitalize"
                fullWidth
              >
                <TagIcon className="h-5 w-5" />
                <Typography color="inherit" className="font-medium capitalize">Media (coming soon)</Typography>
              </Button>
            </li>
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <div className="p-4 xl:ml-80">
        {/* Top Navbar - Clean Design */}
        <div className="flex items-center justify-between py-2 px-4">
          <div className="flex items-center gap-2">
            <IconButton
              ripple={false}
              size="sm"
              variant="text"
              className="block xl:hidden z-50"
              onClick={() => setOpenSidenav(dispatch, true)}
            >
              <Bars3Icon className="h-5 w-5" />
            </IconButton>
            <Typography
              variant="h5"
              color="blue-gray"
              className="font-medium"
            >
              PARTNERS HUB ADMIN
            </Typography>
          </div>
          <div className="flex items-center gap-3">
            <Typography variant="small" color="blue-gray">
              Welcome, {user?.email?.split('@')[0] || 'Admin'}
            </Typography>
            <Button size="sm" variant="text" color="blue-gray" onClick={logout}>
              Logout
            </Button>
          </div>
        </div>

        {/* Page Content */}
        <div className="mt-4 relative">
          {isNavigating && (
            <div className="absolute inset-0 bg-blue-gray-50/50 flex items-center justify-center z-40">
              <div className="flex flex-col items-center gap-4">
                <Spinner className="h-8 w-8" />
                <Typography variant="small" color="blue-gray">
                  Loading...
                </Typography>
              </div>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}