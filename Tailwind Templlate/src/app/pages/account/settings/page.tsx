/* eslint-disable @next/next/no-img-element */
import React from "react";

// @material-tailwind/react
import {
  Tabs,
  TabsHeader,
  Tab,
  Card,
  CardBody,
  CardFooter,
  Button,
  Input,
  Typography,
  Switch,
  Chip,
  CardHeader,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  ChevronUpIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
} from "@heroicons/react/24/solid";
import { ArrowRightIcon } from "@heroicons/react/24/outline";

// components
import Sidebar from "./components/sidebar";
import ProfileHeader from "./components/profile-header";
import BasicInfo from "./components/basic-info";

export default function Settings() {
  return (
    <div className="tw-mb-6 !tw-w-full">
      {/* Tabs */}
      <div className="tw-mt-10">
        <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
          <div className="tw-w-full tw-min-w-max xl:tw-w-4/12">
            <Tabs id="settings-tab" value="message">
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

      {/* Side Menu */}
      <div className="tw-mt-8 tw-grid tw-grid-cols-1 tw-gap-y-6 lg:tw-grid-cols-12 lg:tw-gap-6">
        <Sidebar />

        <div className="!tw-col-span-10">
          {/* Profile Header */}
          <ProfileHeader />
          {/* Basic Info */}
          <BasicInfo />
          {/* Change Password */}
          <Card
            className="tw-mb-6 tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
            id="Change Password"
          >
            <CardHeader floated={false} shadow={false}>
              <Typography variant="h5" color="blue-gray">
                Change Password
              </Typography>
            </CardHeader>
            <CardBody className="tw-flex tw-flex-col tw-gap-6">
              <Input label="Current Password" />
              <Input label="New Password" />
              <Input label="Confirm New Password" />
            </CardBody>
            <CardFooter>
              <Typography variant="h5" color="blue-gray">
                Password Requirement
              </Typography>
              <Typography className="tw-my-2 !tw-font-normal !tw-text-blue-gray-500">
                Please follow this guide for a strong password
              </Typography>
              <div className="tw-flex tw-flex-col tw-justify-between lg:tw-items-end md:tw-items-end tw-gap-8 md:tw-flex-row">
                <div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                    <Typography
                      className="!tw-font-normal !tw-text-blue-gray-500"
                      variant="small"
                    >
                      One special characters
                    </Typography>
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                    <Typography
                      className="!tw-font-normal !tw-text-blue-gray-500"
                      variant="small"
                    >
                      Min 6 characters
                    </Typography>
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                    <Typography
                      className="!tw-font-normal !tw-text-blue-gray-500"
                      variant="small"
                    >
                      One number (2 are recommended)
                    </Typography>
                  </div>
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <span className="tw-h-1.5 tw-w-1.5 tw-rounded-full tw-bg-blue-gray-500" />
                    <Typography
                      className="!tw-font-normal !tw-text-blue-gray-500"
                      variant="small"
                    >
                      Change it often
                    </Typography>
                  </div>
                </div>
                <Button
                  variant="gradient"
                  className="tw-py-2 tw-px-4 tw-ml-auto"
                  size="sm"
                >
                  Update Password
                </Button>
              </div>
            </CardFooter>
          </Card>
          {/* Two-factor authentication */}
          <Card
            className="tw-mb-6 tw-border tw-border-blue-gray-100 tw-shadow-sm"
            id="2FA"
          >
            <CardHeader
              shadow={false}
              floated={false}
              className="tw-flex tw-justify-between tw-rounded-none"
            >
              <Typography variant="h5" color="blue-gray">
                Two-factor authentication
              </Typography>
              <Chip value="enabled" size="sm" color="green" variant="ghost" />
            </CardHeader>
            <CardBody>
              <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-b-gray-200 tw-py-4">
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  Security keys
                </Typography>
                <div className="tw-flex tw-items-center tw-gap-3">
                  <Typography
                    variant="small"
                    className="!tw-font-normal !tw-text-blue-gray-500 tw-ml-auto"
                  >
                    No Security keys
                  </Typography>
                  <Button size="sm" color="gray" variant="outlined">
                    add
                  </Button>
                </div>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-b-gray-200 tw-py-4">
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  SMS number
                </Typography>
                <div className="tw-flex tw-items-center tw-gap-3">
                  <Typography
                    variant="small"
                    className="!tw-font-normal !tw-text-blue-gray-500 tw-ml-auto"
                  >
                    +3012374423
                  </Typography>
                  <Button size="sm" color="gray" variant="outlined">
                    edit
                  </Button>
                </div>
              </div>
              <div className="tw-flex tw-items-center tw-justify-between tw-pt-4">
                <Typography className="!tw-font-normal !tw-text-blue-gray-500">
                  Authenticator app
                </Typography>
                <div className="tw-flex tw-items-center tw-gap-3">
                  <Typography
                    variant="small"
                    className="!tw-font-normal !tw-text-blue-gray-500 tw-ml-auto"
                  >
                    Not Configured
                  </Typography>
                  <Button size="sm" color="gray" variant="outlined">
                    set up
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
          {/* Accounts */}
          <Card
            className="tw-mb-6 tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
            id="Accounts"
          >
            <CardHeader shadow={false} floated={false}>
              <Typography variant="h5" color="blue-gray">
                Accounts
              </Typography>
              <Typography
                className="tw-my-2 !tw-font-normal !tw-text-blue-gray-500"
                variant="small"
              >
                Here you can setup and manage your integration settings.
              </Typography>
            </CardHeader>
            <CardBody>
              <div className="tw-flex tw-items-center tw-justify-between tw-gap-6">
                <div className="tw-flex tw-items-center tw-gap-4">
                  <img
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-slack.7c47c5aa474b5c4fb39fcf05ffb8e4e7.svg"
                    alt="slack"
                    className="tw-w-12"
                  />
                  <div>
                    <Typography variant="h5" color="blue-gray" className="mb-1">
                      Slack
                    </Typography>
                    <div className="tw-flex tw-items-center tw-gap-1">
                      <Typography
                        variant="small"
                        className="!tw-text-blue-gray-500 tw-font-normal"
                      >
                        Show less
                      </Typography>
                      <ChevronUpIcon className="tw-h-4 tw-w-4" />
                    </div>
                  </div>
                </div>
                <div className="tw-flex tw-gap-6">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    Enabled
                  </Typography>
                  <Switch id="switch2" defaultChecked color="gray" />
                </div>
              </div>
              <div className="tw-mt-4 tw-border-b tw-border-b-gray-200 tw-pl-16 tw-pb-6">
                <Typography
                  className="tw-my-2 !tw-font-normal !tw-text-blue-gray-500"
                  variant="small"
                >
                  You haven&apos;t added your Slack yet or you aren&apos;t
                  authorized. Please add our Slack Bot to your account by
                  clicking on here. When you&apos;ve added the bot, send your
                  verification code that you have received.
                </Typography>
                <div className="tw-mt-6 tw-rounded-lg tw-bg-blue-gray-200/20 tw-p-2">
                  <div className="tw-flex tw-flex-col tw-justify-between tw-gap-4 sm:tw-flex-row sm:tw-items-center">
                    <Typography
                      variant="small"
                      className="tw-pl-1 !tw-font-bold !tw-text-blue-gray-600"
                    >
                      Verification Code
                    </Typography>
                    <Input
                      label="Code"
                      containerProps={{
                        className: "tw-w-full sm:tw-w-36 tw-min-w-[144px]",
                      }}
                    />
                  </div>
                </div>
                <div className="tw-mt-6 tw-rounded-lg tw-bg-blue-gray-200/20 tw-p-2">
                  <div className="tw-flex tw-flex-col tw-gap-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                    <Typography
                      variant="small"
                      className="tw-pl-1 !tw-font-bold !tw-text-blue-gray-600 lg:tw-pl-2"
                    >
                      Connected account
                    </Typography>
                    <div className="tw-flex tw-items-center tw-justify-between tw-gap-4 sm:tw-justify-start">
                      <Typography
                        variant="small"
                        className="tw-pl-1 !tw-font-bold"
                        color="blue-gray"
                      >
                        hello@creative-tim.com
                      </Typography>
                      <Button variant="gradient" size="sm">
                        delete
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="tw-flex tw-items-center tw-justify-between tw-gap-6 tw-border-b tw-border-b-gray-200 tw-py-4">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <img
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-spotify.e83cf56c9d99a1fdf59e8deb58bbe470.svg"
                    alt="spotify"
                    className="tw-w-12"
                  />
                  <div>
                    <Typography
                      variant="h5"
                      color="blue-gray"
                      className="tw-mb-1"
                    >
                      Spotify
                    </Typography>
                    <Typography
                      variant="small"
                      className="!tw-text-blue-gray-500 tw-font-normal"
                    >
                      Music
                    </Typography>
                  </div>
                </div>
                <div className="tw-flex tw-gap-6">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    Enabled
                  </Typography>
                  <Switch id="switch3" defaultChecked color="gray" />
                </div>
              </div>

              <div className="tw-flex tw-items-center tw-justify-between tw-gap-6 tw-border-b tw-border-b-gray-200 tw-py-4">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <img
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-atlassian.f2b0e8570a4b4ce768854ff3dad1a6e1.svg"
                    alt="atlassian"
                    className="tw-w-12"
                  />
                  <div>
                    <Typography
                      variant="h5"
                      color="blue-gray"
                      className="tw-mb-1"
                    >
                      Atlassian
                    </Typography>
                    <Typography
                      variant="small"
                      className="!tw-text-blue-gray-500 tw-font-normal"
                    >
                      Payment vendor
                    </Typography>
                  </div>
                </div>
                <div className="tw-flex tw-gap-6">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    Enabled
                  </Typography>
                  <Switch id="switch4" defaultChecked color="gray" />
                </div>
              </div>

              <div className="tw-flex tw-items-center tw-justify-between tw-gap-6 tw-pt-4">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <img
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-asana.d758f410d82760a61d1eabcb03409de6.svg"
                    alt="asana"
                    className="tw-w-12"
                  />
                  <div>
                    <Typography
                      variant="h5"
                      color="blue-gray"
                      className="tw-mb-1"
                    >
                      Asana
                    </Typography>
                    <Typography
                      variant="small"
                      className="!tw-text-blue-gray-500 tw-font-normal"
                    >
                      Organize your team
                    </Typography>
                  </div>
                </div>
                <div className="tw-flex tw-gap-6">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    Enabled
                  </Typography>
                  <Switch id="switch5" />
                </div>
              </div>
            </CardBody>
          </Card>
          {/* Notifications */}
          <Card
            className="tw-mb-6 tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
            id="Notifications"
          >
            <CardHeader floated={false} shadow={false}>
              <Typography variant="h5" color="blue-gray">
                Notifications
              </Typography>
              <Typography
                className="tw-my-2 !tw-font-normal !tw-text-blue-gray-500"
                variant="small"
              >
                Choose how you receive notifications. These notification
                settings apply to the things you&apos;re watching.
              </Typography>
            </CardHeader>
            <CardBody className="tw-overflow-x-scroll">
              <table className="tw-w-full tw-min-w-[600px] tw-table-auto">
                <tbody className="tw-border-blue-gray-50">
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-4">Activity</td>
                    <td>Email</td>
                    <td>Push</td>
                    <td>SMS</td>
                  </tr>
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-3">
                      <div className="tw-grid">
                        <Typography className="tw-font-normal">
                          Mentions
                        </Typography>
                        <Typography className="tw-text-xs tw-font-normal !tw-text-blue-gray-500">
                          Notify when another user mentions you in a comment
                        </Typography>
                      </div>
                    </td>
                    <td>
                      <Switch id="switch6" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch7" color="gray" />
                    </td>
                    <td>
                      <Switch id="switch8" color="gray" />
                    </td>
                  </tr>
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-3">
                      <div className="tw-grid">
                        <Typography className="tw-font-normal">
                          Comments
                        </Typography>
                        <Typography className="tw-text-xs tw-font-normal !tw-text-blue-gray-500">
                          Notify when another user comments your item.
                        </Typography>
                      </div>
                    </td>
                    <td>
                      <Switch id="switch9" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch10" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch11" color="gray" />
                    </td>
                  </tr>
                  <tr className="tw-border-b tw-border-blue-gray-50">
                    <td className="tw-py-3">
                      <div className="tw-grid">
                        <Typography className="tw-font-normal">
                          Follows
                        </Typography>
                        <Typography className="tw-text-xs tw-font-normal !tw-text-blue-gray-500">
                          Notify when another user follows you.
                        </Typography>
                      </div>
                    </td>
                    <td>
                      <Switch id="switch12" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch13" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch14" defaultChecked color="gray" />
                    </td>
                  </tr>
                  <tr className="">
                    <td className="tw-py-5">
                      <div className="tw-grid">
                        <Typography
                          className="!tw-font-normal !tw-text-blue-gray-500"
                          variant="small"
                        >
                          Log in from a new device
                        </Typography>
                      </div>
                    </td>
                    <td>
                      <Switch id="switch15" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch16" defaultChecked color="gray" />
                    </td>
                    <td>
                      <Switch id="switch17" defaultChecked color="gray" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </CardBody>
          </Card>
          {/* Sessions */}
          <Card
            className="tw-mb-6 tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
            id="Sessions"
          >
            <CardHeader shadow={false} floated={false}>
              <Typography variant="h5" color="blue-gray">
                Sessions
              </Typography>
              <Typography
                className="tw-mt-2 !tw-font-normal !tw-text-blue-gray-500"
                variant="small"
              >
                This is a list of devices that have logged into your account.
                Remove those that you do not recognize.
              </Typography>
            </CardHeader>
            <CardBody>
              <div className="tw-flex tw-flex-col tw-gap-4 tw-border-b tw-border-b-gray-200 tw-pb-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <ComputerDesktopIcon className="tw-h-7 tw-w-7 tw-text-blue-gray-900/40" />
                  <div>
                    <Typography
                      variant="small"
                      className="tw-mb-1 !tw-text-blue-gray-500 !tw-font-normal"
                    >
                      Bucharest 68.133.163.201
                    </Typography>
                    <Typography className="tw-text-xs !tw-text-blue-gray-500">
                      Your current session
                    </Typography>
                  </div>
                </div>
                <div className="tw-flex tw-items-center tw-gap-4">
                  <Chip
                    value="active"
                    size="sm"
                    color="green"
                    variant="ghost"
                  />
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    EU
                  </Typography>
                  <div className="tw-ml-auto tw-flex tw-items-center tw-gap-2 sm:tw-ml-0">
                    <Button
                      size="sm"
                      variant="text"
                      className="tw-flex !tw-text-blue-gray-500 tw-items-center tw-gap-2 !tw-font-normal tw-capitalize"
                    >
                      See more{" "}
                      <ArrowRightIcon
                        className="tw-h-3 tw-w-3 tw-text-gray-900"
                        strokeWidth={2.5}
                      />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="tw-flex tw-flex-col tw-gap-4 tw-border-b tw-border-b-gray-200 tw-py-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <ComputerDesktopIcon className="tw-h-7 tw-w-7 tw-text-blue-gray-900/40" />
                  <Typography className="!tw-text-blue-gray-500 !tw-font-normal">
                    Chrome on macOS
                  </Typography>
                </div>
                <div className="tw-flex tw-items-center tw-gap-4">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    US
                  </Typography>
                  <div className="tw-ml-auto tw-flex tw-items-center tw-gap-2 sm:tw-ml-0">
                    <Button
                      size="sm"
                      variant="text"
                      className="tw-flex !tw-text-blue-gray-500 tw-items-center tw-gap-2 !tw-font-normal tw-capitalize"
                    >
                      See more{" "}
                      <ArrowRightIcon
                        className="tw-h-3 tw-w-3 tw-text-gray-900"
                        strokeWidth={2.5}
                      />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="tw-flex tw-flex-col tw-gap-4 tw-pt-4 sm:tw-flex-row sm:tw-items-center sm:tw-justify-between">
                <div className="tw-flex tw-items-center tw-gap-6">
                  <DevicePhoneMobileIcon className="tw-h-7 tw-w-7 tw-text-blue-gray-900/40" />
                  <Typography className="!tw-text-blue-gray-500 !tw-font-normal">
                    Safari on iPhone
                  </Typography>
                </div>
                <div className="tw-flex tw-items-center tw-gap-4">
                  <Typography
                    className="!tw-font-normal !tw-text-blue-gray-500"
                    variant="small"
                  >
                    US
                  </Typography>
                  <div className="tw-ml-auto tw-flex tw-items-center tw-gap-2 sm:tw-ml-0">
                    <Button
                      size="sm"
                      variant="text"
                      className="tw-flex !tw-text-blue-gray-500 tw-items-center tw-gap-2 !tw-font-normal tw-capitalize"
                    >
                      See more{" "}
                      <ArrowRightIcon
                        className="tw-h-3 tw-w-3 tw-text-gray-900"
                        strokeWidth={2.5}
                      />
                    </Button>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>
          {/* Delete Account */}
          <Card
            id="Delete Account"
            className="tw-scroll-mt-4 tw-border tw-border-blue-gray-100 tw-shadow-sm"
          >
            <CardHeader
              floated={false}
              shadow={false}
              className="tw-rounded-none"
            >
              <Typography variant="h5" color="blue-gray">
                Delete Account
              </Typography>
            </CardHeader>
            <CardBody className="tw-flex tw-flex-col tw-gap-4 tw-px-4 tw-pb-4 tw-pt-2 md:tw-flex-row md:tw-items-center">
              <Typography
                className="!tw-font-normal !tw-text-blue-gray-500"
                variant="small"
              >
                Once you delete your account, there is no going back. Please be
                certain.
              </Typography>
              <div className="tw-flex tw-items-center tw-gap-2 md:tw-ml-auto">
                <Button variant="outlined">deactivate</Button>
                <Button color="blue-gray" className="tw-bg-red-600">
                  delete account
                </Button>
              </div>
            </CardBody>
          </Card>
          S
        </div>
      </div>
    </div>
  );
}
