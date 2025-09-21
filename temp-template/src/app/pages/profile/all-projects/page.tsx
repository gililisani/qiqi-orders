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
  Button,
} from "@/components/MaterialTailwind";

// @heroicons/react
import {
  HomeIcon,
  Cog6ToothIcon,
  ChatBubbleLeftEllipsisIcon,
} from "@heroicons/react/24/solid";
import { PlusIcon } from "@heroicons/react/24/outline";

// component
import Projects from "./projects";

export default function AllProjects() {
  return (
    <>
      {/* Profile Header */}
      <div className="tw-relative tw-mt-8 tw-h-[300px] tw-w-full tw-overflow-hidden tw-rounded-xl tw-bg-[url(https://images.unsplash.com/photo-1531512073830-ba890ca4eba2?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1920&q=80)] tw-bg-cover	tw-bg-center">
        <div className="tw-absolute tw-inset-0 tw-h-full tw-w-full tw-bg-gray-800/60" />
      </div>
      <Card className="tw-mx-3 -tw-mt-16 lg:tw-mx-4 tw-border tw-border-blue-gray-100 tw-shadow-sm">
        <CardBody className="tw-p-4">
          <div className="tw-flex tw-flex-wrap tw-items-center tw-justify-between tw-gap-x-12 tw-gap-y-6">
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
        </CardBody>
      </Card>

      {/* Page Description */}
      <div className="tw-mb-16 tw-mt-10">
        <Typography variant="h5" color="blue-gray">
          Some of Our Awesome Projects
        </Typography>
        <div className="tw-mt-2 tw-flex tw-flex-col tw-justify-between tw-gap-6 md:tw-flex-row md:tw-items-center">
          <Typography
            className="tw-w-full !tw-font-normal !tw-text-blue-gray-500 md:tw-w-7/12"
            variant="paragraph"
          >
            This is the paragraph where you can write more details about your
            projects. Keep you user engaged by providing meaningful information.
          </Typography>
          <Button
            className="tw-flex tw-justify-center tw-gap-2"
            variant="gradient"
          >
            <PlusIcon className="tw-h-4 tw-w-4 tw-cursor-pointer tw-uppercase tw-text-white" />
            add new
          </Button>
        </div>
      </div>

      {/* Project Cards */}
      <Projects />
    </>
  );
}
