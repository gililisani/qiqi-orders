// @material-tailwind/react
import {
  Typography,
  Card,
  CardHeader,
  CardBody,
} from "@/components/MaterialTailwind";
import { color } from "@material-tailwind/react/types/components/card";

// component
import AlertComponent from "./alert-component";

export default function Notifications() {
  const alerts: color[] = [
    "pink",
    "blue-gray",
    "green",
    "red",
    "orange",
    "blue",
    "gray",
  ];

  return (
    <div className="tw-mx-auto tw-my-20 !tw-flex !tw-max-w-4xl !tw-flex-col tw-gap-8">
      <Card className="tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardHeader
          color="transparent"
          floated={false}
          shadow={false}
          className="!tw-m-0 !tw-p-4"
        >
          <Typography variant="h5" color="blue-gray">
            Alerts
          </Typography>
        </CardHeader>
        <CardBody className="tw-flex tw-flex-col tw-gap-4 !tw-p-4">
          {alerts.map((color) => (
            <AlertComponent color={color} key={color} />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
