// @material-tailwind/react
import { Typography } from "@/components/MaterialTailwind";

// component
import Steppers from "./components/steppers";

export default function WizardPage() {
  return (
    <div className="tw-mb-4 tw-grid tw-h-[calc(100vh-144px)] tw-grid-cols-1 tw-place-items-center">
      <div className="tw-w-full tw-max-w-4xl">
        <div className="tw-text-center">
          <Typography variant="h3" className="tw-text-blue-gray-800">
            Build Your Profile
          </Typography>
          <Typography variant="lead" className="!tw-text-blue-gray-500">
            This information will let us know more about you.
          </Typography>
        </div>
        <Steppers />
      </div>
    </div>
  );
}
