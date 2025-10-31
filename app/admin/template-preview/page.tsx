"use client";

import React from "react";
import AdminLayoutWrapper from "@/app/components/template/AdminLayoutWrapper";
import { adminRoutes } from "@/app/config/admin-routes";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
} from "@/components/MaterialTailwind";

export default function TemplatePreviewPage() {
  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="tw-mt-8 tw-mb-4">
        <Typography variant="h2" color="blue-gray" className="tw-mb-6">
          Template Preview
        </Typography>
        <Typography variant="lead" color="gray" className="tw-mb-8">
          This is a preview of the new Material Tailwind template design. All existing admin pages remain unchanged.
        </Typography>

        <div className="tw-grid tw-grid-cols-1 tw-gap-6 md:tw-grid-cols-2 lg:tw-grid-cols-3">
          {/* Sample Card 1 */}
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardHeader
              floated={false}
              variant="gradient"
              color="blue"
              className="tw-m-0 tw-mb-4 tw-rounded-b-none tw-p-6 tw-h-28 tw-bg-gradient-to-r tw-from-blue-600 tw-to-blue-400"
            >
              <Typography variant="h6" color="white" className="tw-font-medium">
                Total Orders
              </Typography>
              <Typography variant="h2" color="white">
                2,340
              </Typography>
            </CardHeader>
            <CardBody>
              <Typography variant="small" color="gray" className="tw-font-medium">
                <span className="tw-text-green-500">+14%</span> since last month
              </Typography>
            </CardBody>
          </Card>

          {/* Sample Card 2 */}
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardHeader
              floated={false}
              variant="gradient"
              color="green"
              className="tw-m-0 tw-mb-4 tw-rounded-b-none tw-p-6 tw-h-28 tw-bg-gradient-to-r tw-from-green-600 tw-to-green-400"
            >
              <Typography variant="h6" color="white" className="tw-font-medium">
                Revenue
              </Typography>
              <Typography variant="h2" color="white">
                $53,000
              </Typography>
            </CardHeader>
            <CardBody>
              <Typography variant="small" color="gray" className="tw-font-medium">
                <span className="tw-text-green-500">+8%</span> since last month
              </Typography>
            </CardBody>
          </Card>

          {/* Sample Card 3 */}
          <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
            <CardHeader
              floated={false}
              variant="gradient"
              color="orange"
              className="tw-m-0 tw-mb-4 tw-rounded-b-none tw-p-6 tw-h-28 tw-bg-gradient-to-r tw-from-orange-600 tw-to-orange-400"
            >
              <Typography variant="h6" color="white" className="tw-font-medium">
                Active Partners
              </Typography>
              <Typography variant="h2" color="white">
                72
              </Typography>
            </CardHeader>
            <CardBody>
              <Typography variant="small" color="gray" className="tw-font-medium">
                <span className="tw-text-green-500">+12</span> new this month
              </Typography>
            </CardBody>
          </Card>
        </div>

        {/* Notice Card */}
        <Card className="tw-mt-6 tw-border tw-border-blue-200 tw-bg-blue-50">
          <CardBody>
            <Typography variant="h6" color="blue-gray" className="tw-mb-2">
              🎨 Design Preview Mode
            </Typography>
            <Typography variant="small" color="gray">
              This is an isolated preview of the new template design. Your existing admin pages
              at <code className="tw-text-blue-600">/admin</code> and other routes remain
              completely unchanged and functional.
            </Typography>
          </CardBody>
        </Card>
      </div>
    </AdminLayoutWrapper>
  );
}

