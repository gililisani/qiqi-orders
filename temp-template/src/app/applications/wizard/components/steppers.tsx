"use client";
import React from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
  Input,
  Stepper,
  Step,
  Button,
  Avatar,
  IconButton,
  Checkbox,
  Tooltip,
} from "@material-tailwind/react";

// react-dropzone
import {
  CodeBracketIcon,
  CodeBracketSquareIcon,
  PaintBrushIcon,
  PencilIcon,
} from "@heroicons/react/24/solid";

type Props = {};

export default function Steppers({}: Props) {
  const [activeStep, setActiveStep] = React.useState(0);
  const [isLastStep, setIsLastStep] = React.useState(false);
  const [isFirstStep, setIsFirstStep] = React.useState(false);

  const handleNext = () => !isLastStep && setActiveStep((cur) => cur + 1);
  const handlePrev = () => !isFirstStep && setActiveStep((cur) => cur - 1);

  return (
    <Card className="tw-mt-16 tw-w-full tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        variant="gradient"
        color="gray"
        className="tw-grid tw-h-20 tw-place-items-center"
      >
        <div className="tw-w-full tw-px-20 tw-pt-5 tw-pb-16">
          <Stepper
            activeStep={activeStep}
            isLastStep={(value) => setIsLastStep(value)}
            isFirstStep={(value) => setIsFirstStep(value)}
            lineClassName="tw-bg-white/50"
            activeLineClassName="tw-bg-white"
          >
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 !tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white !tw-text-white"
              completedClassName="!tw-bg-white !tw-text-white"
              onClick={() => setActiveStep(0)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  About
                </Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(1)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  Account
                </Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(2)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  Address
                </Typography>
              </div>
            </Step>
          </Stepper>
        </div>
      </CardHeader>
      <CardBody className="tw-flex tw-flex-col">
        {activeStep === 0 && (
          <React.Fragment>
            <div className="tw-grid tw-w-full tw-max-w-2xl tw-place-self-center">
              <Typography
                variant="h5"
                color="blue-gray"
                className="tw-mb-3 tw-mt-6 tw-text-center !tw-font-normal"
              >
                Let&apos;s start with the basic information
              </Typography>
              <Typography
                variant="paragraph"
                className="tw-text-center !tw-text-blue-gray-500"
              >
                Let us know your name and email address. Use an address you
                don&apos;t mind other users contacting you at
              </Typography>
            </div>
            <div className="tw-mt-8 tw-flex tw-w-full tw-flex-col tw-justify-center tw-gap-x-20 md:tw-flex-row">
              <div className="tw-relative stw-elf-center">
                <Avatar
                  src="/img/team-2.jpeg"
                  size="xxl"
                  alt="avatar"
                  variant="rounded"
                />
                <div className="tw-relative tw-bottom-5 -tw-right-[5.8rem]">
                  <Tooltip content="Edit" placement="top">
                    <IconButton variant="gradient" size="sm">
                      <PencilIcon className="tw-h-3 tw-w-3" />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
              <div className="tw-grid tw-w-full tw-max-w-xl tw-gap-6">
                <Input variant="standard" label="First Name" />
                <Input variant="standard" label="Last Name" />
                <Input variant="standard" label="Email Address" />
              </div>
            </div>
          </React.Fragment>
        )}
        {activeStep === 1 && (
          <React.Fragment>
            <div className="tw-grid tw-w-full tw-max-w-2xl tw-place-self-center">
              <Typography
                variant="h5"
                color="blue-gray"
                className="tw-mb-3 tw-mt-6 tw-text-center !tw-font-normal"
              >
                What are you doing? (checkboxes)
              </Typography>
              <Typography
                variant="paragraph"
                className="tw-text-center !tw-text-blue-gray-500"
              >
                Give us more details about you. What do you enjoy doing in your
                spare time?
              </Typography>
            </div>
            <div className="tw-mt-8 tw-flex tw-w-full tw-flex-col tw-justify-center tw-gap-x-20 tw-gap-y-10 md:tw-flex-row">
              <div className="tw-grid tw-justify-center">
                <Checkbox
                  id="design"
                  ripple={false}
                  className="!tw-h-32 !tw-w-40 tw-border-2 tw-border-gray-900 before:tw-hidden"
                  iconProps={{
                    className:
                      "!tw-opacity-100 !tw-text-gray-900 peer-checked:!tw-text-white",
                  }}
                  icon={<PaintBrushIcon className="tw-h-8 tw-w-8" />}
                />
                <Typography
                  variant="h6"
                  color="blue-gray"
                  className="tw-text-center"
                >
                  Design
                </Typography>
              </div>
              <div className="tw-grid tw-justify-center">
                <Checkbox
                  id="code"
                  ripple={false}
                  className="!tw-h-32 !tw-w-40 tw-border-2 tw-border-gray-900 before:tw-hidden"
                  iconProps={{
                    className:
                      "!tw-opacity-100 !tw-text-gray-900 peer-checked:!tw-text-white",
                  }}
                  icon={<CodeBracketSquareIcon className="tw-h-8 tw-w-8" />}
                />
                <Typography
                  variant="h6"
                  color="blue-gray"
                  className="tw-text-center"
                >
                  Code
                </Typography>
              </div>
              <div className="tw-grid tw-justify-center">
                <Checkbox
                  id="develope"
                  ripple={false}
                  className="!tw-h-32 !tw-w-40 tw-border-2 tw-border-gray-900 before:tw-hidden"
                  iconProps={{
                    className:
                      "!tw-opacity-100 !tw-text-gray-900 peer-checked:!tw-text-white",
                  }}
                  icon={<CodeBracketIcon className="tw-h-8 tw-w-8" />}
                />
                <Typography
                  variant="h6"
                  color="blue-gray"
                  className="tw-text-center"
                >
                  Develope
                </Typography>
              </div>
            </div>
          </React.Fragment>
        )}
        {activeStep === 2 && (
          <React.Fragment>
            <div className="tw-grid tw-w-full tw-max-w-2xl tw-place-self-center">
              <Typography
                variant="h5"
                color="blue-gray"
                className="tw-mb-3 tw-mt-6 tw-text-center !tw-font-normal"
              >
                Are you living in a nice area?
              </Typography>
              <Typography
                variant="paragraph"
                className="tw-text-center !tw-text-blue-gray-500"
              >
                One thing I love about the later sunsets is the chance to go for
                a walk through the neighborhood woods before dinner
              </Typography>
            </div>
            <div className="tw-mt-10 tw-flex tw-w-full tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input variant="static" label="Street Name" />
              <Input variant="static" label="Street Number" />
            </div>
            <div className="tw-mt-10 tw-flex tw-w-full tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input variant="static" label="City" />
              <Input variant="static" label="Country" />
            </div>
          </React.Fragment>
        )}
      </CardBody>
      <CardFooter className="tw-flex tw-justify-between">
        <Button
          color="gray"
          onClick={handlePrev}
          disabled={isFirstStep}
          variant="outlined"
        >
          Prev
        </Button>
        <Button onClick={handleNext} variant="gradient" disabled={isLastStep}>
          Next
        </Button>
      </CardFooter>
    </Card>
  );
}
