'use client';

import React from 'react';
import Link from 'next/link';
import Card from '../../../components/ui/Card';
import {
  ChartBarIcon,
  BuildingOfficeIcon,
  ShoppingCartIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';

const reports = [
  {
    id: 'company-goals',
    name: 'Company Annual Goals Progress',
    description: 'View all companies with their target periods, progress, and completion status',
    icon: ChartBarIcon,
    path: '/admin/reports/company-goals',
    color: 'bg-blue-500',
  },
  {
    id: 'sales',
    name: 'Sales Report',
    description: 'View orders filtered by date range, company, status, subsidiary, and class',
    icon: ShoppingCartIcon,
    path: '/admin/reports/sales',
    color: 'bg-green-500',
  },
  {
    id: 'company-performance',
    name: 'Company Performance',
    description: 'View sales trends, comparisons, and metrics by company with visualizations',
    icon: BuildingOfficeIcon,
    path: '/admin/reports/company-performance',
    color: 'bg-purple-500',
  },
  {
    id: 'product-sales',
    name: 'Product Sales',
    description: 'View top products, sales by product, quantity sold, and revenue',
    icon: CubeIcon,
    path: '/admin/reports/product-sales',
    color: 'bg-orange-500',
  },
];

export default function ReportsPage() {
  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-2">
          Generate and export comprehensive reports on sales, goals, performance, and products
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {reports.map((report) => {
          const Icon = report.icon;
          return (
            <Link key={report.id} href={report.path}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <div className="flex items-start gap-4">
                  <div className={`${report.color} p-3 rounded-lg flex-shrink-0`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {report.name}
                    </h3>
                    <p className="text-sm text-gray-600">{report.description}</p>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

