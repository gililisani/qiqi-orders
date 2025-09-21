/* eslint-disable @next/next/no-img-element */

// @material-tailwind/react
import {
  Card,
  CardHeader,
  Chip,
  Typography,
  Input,
  Button,
  Avatar,
  Progress,
  Select,
  Option,
  Carousel,
} from "@/components/MaterialTailwind";

// @heroicons/react
import { StarIcon } from "@heroicons/react/24/solid";

// Table Data
const TABLE_HEAD = ["PRODUCT", "PRICE", "REVIEW", "AVAILABILITY", "ID"];

const TABLE_ROWS = [
  {
    img: "/img/ecommerce/black-chair.jpeg",
    name: "Christopher Knight Home",
    price: "$89.53",
    availability: (
      <Progress size="sm" value={80} color="green" className="!tw-w-36" />
    ),
    id: 230019,
  },
  {
    img: "/img/ecommerce/chair-pink.jpeg",
    name: "Bar Height Swivel Barstool",
    price: "$99.99",
    availability: (
      <Progress size="sm" value={90} color="green" className="!tw-w-36" />
    ),
    id: 87120,
  },
  {
    img: "/img/ecommerce/chair-steel.jpeg",
    name: "Signature Design by Ashley",
    price: "$129.00",
    availability: (
      <Progress size="sm" value={60} color="amber" className="!tw-w-36" />
    ),
    id: 412301,
  },
  {
    img: "/img/ecommerce/chair-wood.jpeg",
    name: "Modern Square",
    price: "$59.99",
    availability: (
      <Progress size="sm" value={30} color="amber" className="!tw-w-36" />
    ),
    id: "001992",
  },
];

export default function ProductPage() {
  return (
    <Card className="tw-mt-8 tw-mb-4 tw-grid tw-place-content-center md:tw-col-span-1 lg:tw-grid-cols-2 tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <div className="tw-col-span-1">
        <div className="tw-p-6">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="tw-m-0"
          >
            <Typography variant="h5" color="blue-gray">
              Product Details
            </Typography>
          </CardHeader>
          <Carousel className="tw-mt-6 !tw-h-[34rem] tw-max-w-[44rem] tw-rounded-xl">
            <img
              src="/img/products/product-details-1.jpg"
              alt="image 1"
              className="tw-h-full tw-w-full tw-object-cover tw-object-center"
            />
            <img
              src="/img/products/product-details-2.jpg"
              alt="image 1"
              className="tw-h-full tw-w-full tw-object-cover tw-object-center"
            />
            <img
              src="/img/products/product-details-3.jpg"
              alt="image 1"
              className="tw-h-full tw-w-full tw-object-cover tw-object-center"
            />
            <img
              src="/img/products/product-details-4.jpg"
              alt="image 1"
              className="tw-h-full tw-w-full tw-object-cover tw-object-center"
            />
          </Carousel>
        </div>
      </div>

      <div className="tw-col-span-1 tw-mt-6 tw-mb-10 tw-px-16">
        <div className="lg:tw-mt-12">
          <Typography variant="h3" color="blue-gray">
            Minimal Bar Stool
          </Typography>
          <div className="tw-mt-2 tw-flex tw-gap-1 !tw-text-blue-gray-500">
            <StarIcon className="tw-h-5 tw-w-5" />
            <StarIcon className="tw-h-5 tw-w-5" />
            <StarIcon className="tw-h-5 tw-w-5" />
            <StarIcon className="tw-h-5 tw-w-5" />
            <StarIcon className="tw-h-5 tw-w-5" />
          </div>
          <div className="tw-mt-6 tw-flex tw-w-20 tw-flex-col tw-gap-1 !tw-text-blue-gray-500">
            <Typography variant="h6" color="blue-gray">
              Price
            </Typography>
            <Typography variant="h5" color="blue-gray">
              $1,419
            </Typography>
            <Chip
              value="in stock"
              className="tw-mt-2 !tw-bg-green-100 !tw-text-green-600"
            />
          </div>
          <div className="tw-mt-6 tw-grid tw-w-full tw-gap-1 !tw-text-blue-gray-500">
            <Typography variant="small" className="!tw-font-normal">
              Description
            </Typography>
            <div className="tw-mt-2 tw-px-3">
              <div className="tw-flex tw-items-baseline tw-gap-2">
                <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                <Typography variant="paragraph">
                  The most beautiful curves of this swivel stool adds an elegant
                  touch to any environment
                </Typography>
              </div>
              <div className="tw-flex tw-items-baseline tw-gap-2">
                <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                <Typography variant="paragraph">
                  Memory swivel seat returns to original seat position
                </Typography>
              </div>
              <div className="tw-flex tw-items-baseline tw-gap-2">
                <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                <Typography variant="paragraph">
                  Comfortable integrated layered chair seat cushion design
                </Typography>
              </div>
              <div className="tw-flex tw-items-baseline tw-gap-2">
                <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                <Typography variant="paragraph">
                  Fully assembled! No assembly required
                </Typography>
              </div>
            </div>

            <div className="tw-mt-10 tw-flex tw-flex-col tw-gap-4 !tw-text-blue-gray-500 md:tw-flex-row">
              <Select
                label="Steel"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              >
                <Option>Aluminium</Option>
                <Option>Carbon</Option>
                <Option>Steel</Option>
                <Option>Wood</Option>
              </Select>
              <Select
                label="Color"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              >
                <Option>Black</Option>
                <Option>Blue</Option>
                <Option>Green</Option>
                <Option>Orang</Option>
                <Option>White</Option>
              </Select>
              <Input
                type="number"
                label="Quantity"
                containerProps={{ className: "!tw-min-w-[50px]" }}
              />
            </div>
            <Button className="tw-mt-4 lg:tw-w-max">add to cart</Button>
          </div>
        </div>
      </div>

      <div className="tw-col-span-full tw-mt-8 tw-overflow-scroll !tw-p-6">
        <Typography variant="h5" color="blue-gray" className="tw-mb-2">
          Other Products
        </Typography>
        <table className="tw-w-full tw-min-w-max tw-table-auto !tw-text-left">
          <thead>
            <tr className="tw-border-b tw-border-blue-gray-50 !tw-text-xs !tw-font-medium tw-opacity-60">
              {TABLE_HEAD.map((head) => (
                <th key={head} className="!tw-py-4">
                  {head}{" "}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABLE_ROWS.map(({ img, name, price, availability, id }, index) => {
              const isLast = index === TABLE_ROWS.length - 1;
              const classes = isLast
                ? "!tw-p-4"
                : "!tw-p-4 tw-border-b tw-border-blue-gray-50";

              return (
                <tr
                  key={name}
                  className="tw-border-b tw-border-blue-gray-50 tw-text-sm !tw-text-blue-gray-500/60"
                >
                  <td className={classes}>
                    <div className="tw-flex tw-items-center !tw-gap-4">
                      <Avatar
                        src={img}
                        alt={name}
                        size="md"
                        variant="rounded"
                      />
                      <Typography
                        variant="small"
                        color="blue-gray"
                        className="!tw-font-semibold"
                      >
                        {name}
                      </Typography>
                    </div>
                  </td>
                  <td className={classes}>{price}</td>
                  <td className={classes}>
                    <div className="tw-flex tw-gap-1 !tw-text-blue-gray-500">
                      <StarIcon className="tw-h-5 tw-w-5" />
                      <StarIcon className="tw-h-5 tw-w-5" />
                      <StarIcon className="tw-h-5 tw-w-5" />
                      <StarIcon className="tw-h-5 tw-w-5" />
                      <StarIcon className="tw-h-5 tw-w-5" />
                    </div>
                  </td>
                  <td className={classes}>{availability}</td>
                  <td className={classes}>{id}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
