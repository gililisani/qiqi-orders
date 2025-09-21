/* eslint-disable @next/next/no-img-element */

// @material-tailwind/react
import {
  Tabs,
  TabsHeader,
  Tab,
  Card,
  Button,
  Typography,
  CardHeader,
  CardBody,
} from "@/components/MaterialTailwind";

const TABLE_HEAD = ["Item", "Qty", "Rate", "Amount"];

export default function Invoice() {
  return (
    <>
      <div className="tw-mt-8">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
          <div className="tw-w-full lg:tw-w-4/12">
            <Tabs value="message">
              <TabsHeader>
                <Tab value="message">Message</Tab>
                <Tab value="social">Social</Tab>
                <Tab value="notifications">Notifications</Tab>
                <Tab value="backup">Backup</Tab>
              </TabsHeader>
            </Tabs>
          </div>
        </div>
      </div>

      <div className="tw-my-20 tw-grid tw-place-items-center">
        <Card className="tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm tw-max-w-[846px]">
          <CardHeader
            floated={false}
            shadow={false}
            color="transparent"
            className="tw-m-0 tw-p-6"
          >
            <div className="tw-items-center tw-justify-between md:tw-grid-rows-2 md:tw-items-start lg:tw-flex">
              <div className="tw-grid md:tw-mb-20">
                <img
                  src="/img/logo-ct-dark.png"
                  alt="ct"
                  className="tw-mb-6 tw-h-14 tw-w-14 tw-max-w-xs"
                />
                <Typography
                  className="!tw-font-semibold tw-mb-2"
                  color="blue-gray"
                >
                  St. Independence Embankment, <br /> 050105 Bucharest, Romania
                </Typography>
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  tel: +4 (074) 1090873
                </Typography>
              </div>
              <div className="tw-mt-12 tw-grid md:tw-text-left lg:tw-text-right">
                <Typography className="!tw-font-semibold" color="blue-gray">
                  Billed to: John Doe
                </Typography>
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  4006 Locust View Drive
                </Typography>
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  San Francisco CA
                </Typography>
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  California
                </Typography>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="tw-justify-between md:tw-flex-wrap lg:tw-flex">
              <div className="grid">
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  Invoice no
                </Typography>
                <Typography
                  className="tw-text-xl !tw-font-semibold"
                  color="blue-gray"
                >
                  #0453119
                </Typography>
              </div>

              <ul className="tw-mt-8 lg:tw-mt-0 lg:tw-min-w-[320px]">
                <li className="tw-flex tw-w-full tw-items-center tw-justify-between tw-gap-4">
                  <Typography className="!tw-text-blue-gray-500">
                    Invoice date:
                  </Typography>
                  <Typography color="blue-gray" className="!!tw-font-bold">
                    06/03/2019
                  </Typography>
                </li>
                <li className="tw-flex tw-w-full tw-items-center tw-justify-between tw-gap-4">
                  <Typography className="!tw-text-blue-gray-500">
                    Due date:
                  </Typography>
                  <Typography color="blue-gray" className="!tw-font-bold">
                    11/03/2019
                  </Typography>
                </li>
              </ul>
            </div>

            <div className="tw-mt-16 tw-overflow-scroll">
              <table className="tw-w-full tw-min-w-max tw-table-auto !tw-text-left">
                <thead>
                  <tr>
                    {TABLE_HEAD.map((head, index) => (
                      <th key={head} className="tw-cursor-pointer tw-border-b">
                        <Typography
                          color="gray"
                          className="tw-flex !tw-font-bold tw-mb-4"
                        >
                          {head}{" "}
                        </Typography>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tw-border-t tw-border-blue-gray-50">
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-3">Premium Support</td>
                    <td>1</td>
                    <td>$ 9.00</td>
                    <td>$ 9.00</td>
                  </tr>
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-3 !tw-border-0">
                      Material Dashboard 2 PRO
                    </td>
                    <td>3</td>
                    <td>$ 100.00</td>
                    <td>$ 300.00</td>
                  </tr>
                  <tr>
                    <td className="tw-py-3 !tw-border-0">Parts for service</td>
                    <td>1</td>
                    <td>$ 89.00</td>
                    <td>$ 89.00</td>
                  </tr>
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td></td>
                    <td></td>
                    <td
                      className="tw-text-xl !tw-font-bold !tw-border-0 pb-3"
                      color="blue-gray"
                    >
                      Total
                    </td>
                    <td
                      className="tw-text-xl !tw-font-bold !tw-border-0"
                      color="blue-gray"
                    >
                      $ 698
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="tw-mt-20 tw-grid">
              <Typography
                className="tw-text-xl !tw-font-semibold"
                color="blue-gray"
              >
                Thank you!
              </Typography>
              <Typography
                className="tw-mt-2 !tw-font-normal !tw-text-blue-gray-500"
                variant="small"
              >
                If you encounter any issues related to the invoice <br /> you
                can contact us at:
              </Typography>
              <div className="tw-mt-6 tw-flex">
                <Typography className="!tw-text-blue-gray-500">
                  email:{" "}
                </Typography>
                <Typography color="blue-gray">
                  &nbsp; support@creative-tim.com
                </Typography>
                <Button className="tw-ml-auto">print</Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
