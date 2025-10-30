// @material-tailwind/react
import { Typography } from "@/components/MaterialTailwind";

// component
import Steppers from "./steppers";

export default function NewProduct() {
  return (
    <div className="tw-mb-4 tw-grid tw-h-[calc(100vh-144px)] tw-grid-cols-1 tw-place-items-center">
      <div className="tw-w-full tw-max-w-4xl">
        <div className="tw-text-center">
          <Typography variant="h3" className="tw-text-blue-gray-800">
            Add New Product
          </Typography>
          <Typography variant="lead" className="!tw-text-blue-gray-500">
            This information will describe more about the product.
          </Typography>
        </div>
        <Steppers />
      </div>
    </div>
  );
}
