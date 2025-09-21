import React from "react";

// @material-tailwind/react
import {
  Card,
  CardBody,
  Avatar,
  Typography,
  Tabs,
  TabsHeader,
  Tab,
  Tooltip,
  IconButton,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  HomeIcon,
  ChatBubbleLeftEllipsisIcon,
  Cog6ToothIcon,
  PencilIcon,
} from "@heroicons/react/24/solid";

// @widgets
import ProfileInfoCard from "@/widgets/cards/profile-info-card";
import Conversations from "./components/conversations";
import PlatformSettings from "./components/platform-settings";
import BlogCards from "./components/blog-cards";

export default function Profile() {
  return (
    <>
      {/* Profile Header */}
      <div className="tw-relative tw-mt-8 tw-h-[300px] tw-w-full tw-overflow-hidden tw-rounded-xl tw-bg-[url('/img/bg-profile.jpeg')] tw-bg-cover	tw-bg-center">
        <div className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-bg-gray-800/60" />
      </div>
      <Card className="tw-mx-3 -tw-mt-16 tw-mb-6 lg:tw-mx-4 tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardBody className="p-4">
          <div className="tw-mb-10 tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-x-12 tw-gap-y-6">
            <div className="tw-flex tw-items-center tw-gap-6">
              <Avatar
                src="/img/bruce-mars.jpeg"
                alt="bruce-mars"
                size="xl"
                variant="rounded"
                className="tw-shadow-lg tw-shadow-blue-gray-500/40"
              />
              <div>
                <Typography variant="h5" color="blue-gray" className="tw-mb-1">
                  Richard Davis
                </Typography>
                <Typography
                  variant="small"
                  className="!tw-font-normal !tw-text-blue-gray-600"
                >
                  CEO / Co-Founder
                </Typography>
              </div>
            </div>
            <div className="tw-w-full lg:tw-w-96">
              <Tabs id="profile-overview-tab" value="app">
                <TabsHeader>
                  <Tab value="app">
                    <HomeIcon className="-tw-mt-1 tw-mr-2 tw-inline-block tw-h-5 tw-w-5" />
                    App
                  </Tab>
                  <Tab value="message">
                    <ChatBubbleLeftEllipsisIcon className="-tw-mt-0.5 tw-mr-2 tw-inline-block tw-h-5 tw-w-5" />
                    Message
                  </Tab>
                  <Tab value="settings">
                    <Cog6ToothIcon className="-tw-mt-1 tw-mr-2 tw-inline-block tw-h-5 tw-w-5" />
                    Settings
                  </Tab>
                </TabsHeader>
              </Tabs>
            </div>
          </div>
          <div className="tw-gird-cols-1 tw-mb-12 tw-grid tw-gap-12 tw-px-4 lg:tw-grid-cols-2 xl:tw-grid-cols-3">
            {/* Platform Setting */}
            <PlatformSettings />
            {/* ProfileInfo Card */}
            <ProfileInfoCard
              title="Profile Information"
              description="Hi, I'm Alec Thompson, Decisions: If you can't decide, the answer is no. If two equally difficult paths, choose the one more painful in the short term (pain avoidance is creating an illusion of equality)."
              details={{
                "full Name": "Alec M. Thompson",
                mobile: "(44) 123 1234 123",
                email: "alecthompson@mail.com",
                location: "USA",
                social: (
                  <div className="tw-flex tw-items-center tw-gap-2">
                    <IconButton variant="text" size="sm">
                      <i className="fa-brands tw-text-base fa-facebook tw-text-blue-700" />
                    </IconButton>
                    <IconButton variant="text" size="sm">
                      <i className="fa-brands tw-text-base fa-twitter tw-text-blue-400" />
                    </IconButton>
                    <IconButton variant="text" size="sm">
                      <i className="fa-brands tw-text-base fa-instagram tw-text-purple-500" />
                    </IconButton>
                  </div>
                ),
              }}
              action={
                <Tooltip content="Edit Profile">
                  <IconButton size="sm" variant="text" color="blue-gray">
                    <PencilIcon className="tw-h-4 tw-w-4 tw-cursor-pointer !tw-text-blue-gray-500" />
                  </IconButton>
                </Tooltip>
              }
            />

            <Conversations />
          </div>

          <BlogCards />
        </CardBody>
      </Card>
    </>
  );
}
