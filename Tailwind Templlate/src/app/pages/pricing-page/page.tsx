/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import { Fragment, useState } from "react";

// @material-tailwind/react
import {
  Card,
  Tab,
  TabsHeader,
  Tabs,
  Typography,
  CardBody,
  Accordion,
  AccordionHeader,
  AccordionBody,
} from "@material-tailwind/react";

// @heroicons/react
import { PricingCard } from "@/widgets/cards";

// @heroicons/react
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { AuthFooter, Navbar } from "@/widgets/layout";

// Accordion
function Icon({ id, open }: { id: number; open: number }) {
  return (
    <ChevronDownIcon
      className={`${
        id === open ? "tw-rotate-180" : ""
      } tw-h-5 tw-w-5 tw-transition-transform`}
      strokeWidth={2}
    />
  );
}

export default function PricingPage() {
  const [open, setOpen] = useState(0);
  const [isAnnual, setIsAnnual] = React.useState(false);

  const handleOpen = (value: React.SetStateAction<number>) =>
    setOpen(open === value ? 0 : value);

  const PRICING_CARD_DATA = [
    {
      title: "starter",
      price: isAnnual ? 119 : 59,
      color: "white",
      actionColor: "gray",
      actionLabel: "join",
      actionRoute: "/auth/pricing-page",
      options: [
        {
          included: true,
          name: "2 team members",
        },
        {
          included: true,
          name: "20GB Cloud storage",
        },
        {
          included: false,
          name: "Integration help",
        },
        {
          included: false,
          name: "Sketch Files",
        },
        {
          included: false,
          name: "API Access",
        },
        {
          included: false,
          name: "Complete documentation",
        },
      ],
    },
    {
      title: "premium",
      price: isAnnual ? 159 : 89,
      color: "gray",
      actionColor: "white",
      actionLabel: "try premium",
      actionRoute: "/auth/pricing-page",
      options: [
        {
          included: true,
          name: "10 team members",
        },
        {
          included: true,
          name: "40GB Cloud storage",
        },
        {
          included: true,
          name: "Integration help",
        },
        {
          included: true,
          name: "Sketch Files",
        },
        {
          included: false,
          name: "API Access",
        },
        {
          included: false,
          name: "Complete documentation",
        },
      ],
    },
    {
      title: "enterprise",
      price: isAnnual ? 399 : 99,
      color: "white",
      actionColor: "gray",
      actionLabel: "join",
      actionRoute: "/auth/pricing-page",
      options: [
        {
          included: true,
          name: "Unlimited team members",
        },
        {
          included: true,
          name: "100GB Cloud storage",
        },
        {
          included: true,
          name: "Integration help",
        },
        {
          included: true,
          name: "Sketch Files",
        },
        {
          included: true,
          name: "API Access",
        },
        {
          included: true,
          name: "Complete documentation",
        },
      ],
    },
  ];

  return (
    <>
      <div className="tw-p-4">
        <div className="tw-container tw-mx-auto tw-z-50 tw-relative">
          {/* {getRoutes(routes)} */}
          <Navbar />
        </div>
        <div className="tw-relative tw-grid tw-h-[50vh] tw-min-h-[50vh] tw-w-full tw-place-items-center tw-overflow-hidden tw-rounded-xl">
          <img
            src="https://images.unsplash.com/photo-1497294815431-9365093b7331?ixlib=rb-1.2.1&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1950&q=80"
            className="tw-absolute tw-inset-0 tw-z-0 tw-grid tw-h-full tw-w-full tw-place-items-center tw-rounded-xl tw-object-cover"
            alt="image"
          />
          <div className="tw-absolute tw-top-0 tw-left-0 tw-block tw-h-full tw-w-full tw-bg-black/50" />
          <div className="tw-relative tw-z-10 tw-px-8 tw-text-center">
            <Typography variant="h2" color="white" className="tw-mb-2">
              Pick the best plan for you
            </Typography>
            <Typography variant="paragraph" color="white">
              You have Free Unlimited Updates and Premium Support on each
              package.
            </Typography>
          </div>
        </div>
      </div>

      <div className="tw-mx-auto -tw-mt-20 tw-w-full tw-px-12">
        <Card className="tw-mb-44 tw-shadow-black/20 tw-border tw-border-blue-gray-100 tw-shadow-sm">
          <CardBody className="tw-pt-12">
            <div className="tw-container tw-mx-auto">
              <div className="tw-mx-auto tw-mb-14 tw-max-w-[400px]">
                <Tabs id="pricing-tabs" value="monthly">
                  <TabsHeader>
                    <Tab
                      value="monthly"
                      className="tw-py-2"
                      onClick={() => setIsAnnual(false)}
                    >
                      Monthly
                    </Tab>
                    <Tab
                      value="annual"
                      className="tw-py-2"
                      onClick={() => setIsAnnual(true)}
                    >
                      Annual
                    </Tab>
                  </TabsHeader>
                </Tabs>
              </div>

              <div className="tw-grid tw-place-items-center tw-gap-6 md:tw-grid-cols-1 lg:tw-grid-cols-3">
                {PRICING_CARD_DATA.map((props) => (
                  <PricingCard key={props.title} {...props} />
                ))}
              </div>

              <div className="tw-my-16 tw-grid tw-place-items-center">
                <Typography
                  color="blue-gray"
                  variant="h6"
                  className="tw-my-10 tw-opacity-60"
                >
                  More than 50+ brands trust Material
                </Typography>
                <div className="tw-grid tw-place-items-center md:tw-grid-cols-2 lg:tw-grid-cols-6">
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-coinbase.87e91c7f318f2d82f46e78469976128b.svg"
                    alt="coinbase"
                  />
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-nasa.c5d11f8820bfde5fd64db0074156e06c.svg"
                    alt="nasa"
                  />
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-netflix.432ed6b5c31b9bcab9a38e32bf46a1e9.svg"
                    alt="netflix"
                  />
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-pinterest.844709031a3c1266979e933c371e043a.svg"
                    alt="pinterest"
                  />
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-spotify.7e255dc67938d13ff97cc8f16812d325.svg"
                    alt="spotify"
                  />
                  <img
                    className="tw-h-auto tw-w-72"
                    src="https://demos.creative-tim.com/material-dashboard-pro-react/static/media/logo-vodafone.b3e8486c0cac220bc3a31c9eab049b21.svg"
                    alt="vodafone"
                  />
                </div>
              </div>

              <div className="tw-my-24 tw-mx-auto tw-grid tw-max-w-5xl tw-place-items-center">
                <Typography color="blue-gray" variant="h2">
                  Frequently Asked Questions
                </Typography>
                <Typography
                  color="blue-gray"
                  variant="paragraph"
                  className="tw-my-4 tw-opacity-60 !tw-font-normal"
                >
                  A lot of people don&apos;t appreciate the moment until
                  it&apos;s passed. I&apos;m not trying my hardest, and I&apos;m
                  not trying to do
                </Typography>
                <Fragment>
                  <Accordion
                    open={open === 1}
                    icon={<Icon id={1} open={open} />}
                  >
                    <AccordionHeader onClick={() => handleOpen(1)}>
                      How do I order?
                    </AccordionHeader>
                    <AccordionBody className="!tw-font-normal !tw-text-blue-gray-500">
                      We&apos;re not always in the position that we want to be
                      at. We&apos;re constantly growing. We&apos;re constantly
                      making mistakes. We&apos;re constantly trying to express
                      ourselves and actualize our dreams. If you have the
                      opportunity to play this game of life you need to
                      appreciate every moment. A lot of people don&apos;t
                      appreciate the moment until it&apos;s passed.
                    </AccordionBody>
                  </Accordion>
                  <Accordion
                    open={open === 2}
                    icon={<Icon id={2} open={open} />}
                  >
                    <AccordionHeader onClick={() => handleOpen(2)}>
                      How can I make the payment?
                    </AccordionHeader>
                    <AccordionBody className="!tw-font-normal !tw-text-blue-gray-500">
                      It really matters and then like it really doesn&apos;t
                      matter. What matters is the people who are sparked by it.
                      And the people who are like offended by it, it
                      doesn&apos;t matter. Because it&apos;s about motivating
                      the doers. Because I&apos;m here to follow my dreams and
                      inspire other people to follow their dreams, too.
                      We&apos;re not always in the position that we want to be
                      at. We&apos;re constantly growing. We&apos;re constantly
                      making mistakes. We&apos;re constantly trying to express
                      ourselves and actualize our dreams. If you have the
                      opportunity to play this game of life you need to
                      appreciate every moment. A lot of people don&apos;t
                      appreciate the moment until it&apos;s passed.
                    </AccordionBody>
                  </Accordion>
                  <Accordion
                    open={open === 3}
                    icon={<Icon id={3} open={open} />}
                  >
                    <AccordionHeader onClick={() => handleOpen(3)}>
                      How much time does it take to recieve the order?
                    </AccordionHeader>
                    <AccordionBody className="!tw-font-normal !tw-text-blue-gray-500">
                      The time is now for it to be okay to be great. People in
                      this world shun people for being great. For being a bright
                      color. For standing out. But the time is now to be okay to
                      be the greatest you. Would you believe in what you believe
                      in, if you were the only one who believed it? If
                      everything I did failed - which it doesn&apos;t, it
                      actually succeeds - just the fact that I&apos;m willing to
                      fail is an inspiration. People are so scared to lose that
                      they don&apos;t even try. Like, one thing people
                      can&apos;t say is that I&apos;m not trying, and I&apos;m
                      not trying my hardest, and I&apos;m not trying to do the
                      best way I know how.
                    </AccordionBody>
                  </Accordion>
                  <Accordion
                    open={open === 4}
                    icon={<Icon id={4} open={open} />}
                  >
                    <AccordionHeader onClick={() => handleOpen(4)}>
                      Can I resell the products?
                    </AccordionHeader>
                    <AccordionBody className="!tw-font-normal !tw-text-blue-gray-500">
                      I always felt like I could do anything. That&apos;s the
                      main thing people are controlled by! Thoughts- their
                      perception of themselves! They&apos;re slowed down by
                      their perception of themselves. If you&apos;re taught you
                      can&apos;t do anything, you won&apos;t do anything. I was
                      taught I could do everything. If everything I did failed -
                      which it doesn&apos;t, it actually succeeds - just the
                      fact that I&apos;m willing to fail is an inspiration.
                      People are so scared to lose that they don&apos;t even
                      try. Like, one thing people can&apos;t say is that
                      I&apos;m not trying, and I&apos;m not trying my hardest,
                      and I&apos;m not trying to do the best way I know how.
                    </AccordionBody>
                  </Accordion>
                  <Accordion
                    open={open === 5}
                    icon={<Icon id={5} open={open} />}
                  >
                    <AccordionHeader onClick={() => handleOpen(5)}>
                      Where do I find the shipping details?
                    </AccordionHeader>
                    <AccordionBody className="!tw-font-normal !tw-text-blue-gray-500">
                      There&apos;s nothing I really wanted to do in life that I
                      wasn&apos;t able to get good at. That&apos;s my skill.
                      I&apos;m not really specifically talented at anything
                      except for the ability to learn. That&apos;s what I do.
                      That&apos;s what I&apos;m here for. Don&apos;t be afraid
                      to be wrong because you can&apos;t learn anything from a
                      compliment. I always felt like I could do anything.
                      That&apos;s the main thing people are controlled by!
                      Thoughts- their perception of themselves! They&apos;re
                      slowed down by their perception of themselves. If
                      you&apos;re taught you can&apos;t do anything, you
                      won&apos;t do anything. I was taught I could do
                      everything.
                    </AccordionBody>
                  </Accordion>
                </Fragment>
              </div>
            </div>
          </CardBody>
        </Card>
        <AuthFooter />
      </div>
    </>
  );
}
