"use client";

import React from "react";
import AdminLayoutWrapper from "@/app/components/template/AdminLayoutWrapper";
import { adminRoutes } from "@/app/config/admin-routes";
import {
  Card,
  CardHeader,
  CardBody,
  Typography,
} from "@material-tailwind/react";

const defaultProps = {
  placeholder: undefined,
  onPointerEnterCapture: undefined,
  onPointerLeaveCapture: undefined,
};

export default function TemplatePreviewPage() {
  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="mt-8 mb-4">
        <Typography variant="h2" color="blue-gray" className="mb-6" {...defaultProps}>
          Template Preview
        </Typography>
        <Typography variant="lead" color="gray" className="mb-8" {...defaultProps}>
          This is a preview of the new Material Tailwind template design. All existing admin pages remain unchanged.
        </Typography>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {/* Sample Card 1 */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="blue"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-blue-600 to-blue-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                Total Orders
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                2,340
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                <span className="text-green-500">+14%</span> since last month
              </Typography>
            </CardBody>
          </Card>

          {/* Sample Card 2 */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="green"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-green-600 to-green-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                Revenue
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                $53,000
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                <span className="text-green-500">+8%</span> since last month
              </Typography>
            </CardBody>
          </Card>

          {/* Sample Card 3 */}
          <Card className="border border-blue-gray-100 shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader
              floated={false}
              variant="gradient"
              color="orange"
              className="m-0 mb-4 rounded-b-none p-6 h-28 bg-gradient-to-r from-orange-600 to-orange-400"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              <Typography variant="h6" color="white" className="font-medium" {...defaultProps}>
                Active Partners
              </Typography>
              <Typography variant="h2" color="white" {...defaultProps}>
                72
              </Typography>
            </CardHeader>
            <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="small" color="gray" className="font-medium" {...defaultProps}>
                <span className="text-green-500">+12</span> new this month
              </Typography>
            </CardBody>
          </Card>
        </div>

        {/* Notice Card */}
        <Card className="mt-6 border border-blue-200 bg-blue-50" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
          <CardBody placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <Typography variant="h6" color="blue-gray" className="mb-2" {...defaultProps}>
              🎨 Design Preview Mode
            </Typography>
            <Typography variant="small" color="gray" {...defaultProps}>
              This is an isolated preview of the new template design. Your existing admin pages
              at <code className="text-blue-600">/admin</code> and other routes remain
              completely unchanged and functional.
            </Typography>
          </CardBody>
        </Card>
      </div>
    </AdminLayoutWrapper>
  );
}

