"use client";
import React, { useEffect, useState } from "react";

// @material-tailwind/react
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Typography,
  Input,
  Textarea,
  Select,
  Option,
  Stepper,
  Step,
  Button,
  Avatar,
} from "@material-tailwind/react";

// react-dropzone
import { useDropzone } from "react-dropzone";

type Props = {};

export default function Steppers({}: Props) {
  const [activeStep, setActiveStep] = React.useState(0);
  const [isLastStep, setIsLastStep] = React.useState(false);
  const [isFirstStep, setIsFirstStep] = React.useState(false);

  const handleNext = () => !isLastStep && setActiveStep((cur) => cur + 1);
  const handlePrev = () => !isFirstStep && setActiveStep((cur) => cur - 1);

  const [files, setFiles] = useState<{ preview: string }[]>([]);

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      "image/*": [],
    },

    onDrop: (acceptedFiles) => {
      setFiles((cur) => [
        ...cur,
        ...acceptedFiles.map((file) =>
          Object.assign(file, {
            preview: URL.createObjectURL(file),
          })
        ),
      ]);
    },
  });

  const thumbs = files.map((file, key) => (
    <Avatar
      size="xxl"
      key={key}
      src={file.preview}
      className="relative z-50"
      onLoad={() => URL.revokeObjectURL(file.preview)}
    />
  ));

  useEffect(() => {
    // Make sure to revoke the data uris to avoid memory leaks, will run on unmount
    return () => files.forEach((file) => URL.revokeObjectURL(file.preview));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(0)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  1. Product Info
                </Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(1)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  2. Media
                </Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(2)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  3. Social
                </Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
              onClick={() => setActiveStep(3)}
            >
              <div className="tw-absolute tw-top-6 -tw-bottom-[2.3rem] tw-w-max tw-text-center">
                <Typography
                  color="inherit"
                  className="tw-text-xs tw-uppercase !tw-font-normal"
                >
                  4. Pricing
                </Typography>
              </div>
            </Step>
          </Stepper>
        </div>
      </CardHeader>
      <CardBody className="tw-flex tw-flex-col">
        {activeStep === 0 && (
          <React.Fragment>
            <Typography variant="h5" color="blue-gray">
              Product Information
            </Typography>
            <div className="tw-mb-4 tw-mt-8 tw-flex tw-w-full tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input label="Name" />
              <Input label="Weight" />
            </div>
            <div className="tw-mt-2 tw-grid tw-gap-6 md:tw-grid-cols-1 lg:tw-grid-cols-2">
              <Textarea label="Description" />
              <div className="tw-grid tw-gap-6">
                <Select color="gray" label="Category">
                  <Option>Clothing</Option>
                  <Option>Electronics</Option>
                  <Option>Furniture</Option>
                  <Option>Others</Option>
                  <Option>Real Estate</Option>
                </Select>
                <Select color="gray" label="Size">
                  <Option>Extra Large</Option>
                  <Option>Extra Small</Option>
                  <Option>Large</Option>
                  <Option>Medium</Option>
                  <Option>Small</Option>
                </Select>
              </div>
            </div>
          </React.Fragment>
        )}
        {activeStep === 1 && (
          <React.Fragment>
            <Typography variant="h5" color="blue-gray" className="mb-8">
              Media
            </Typography>
            <Typography variant="small">Product Image</Typography>
            {/* Dropzone */}
            <div
              {...getRootProps({ className: "dropzone" })}
              className="tw-mt-2 tw-grid tw-place-items-center tw-rounded-lg tw-border tw-border-blue-gray-100 tw-p-16"
            >
              <input {...getInputProps()} />
              {files.length === 0 && (
                <Typography variant="small">
                  Drop files here to upload
                </Typography>
              )}
              <aside className="tw-flex tw-items-center tw-gap-4">
                {thumbs}
              </aside>
            </div>
          </React.Fragment>
        )}
        {activeStep === 2 && (
          <React.Fragment>
            <Typography variant="h5" color="blue-gray">
              Socials
            </Typography>
            <div className="tw-mt-6 tw-flex tw-w-full tw-flex-col tw-gap-6">
              <Input label="Shoppify Handle" />
              <Input label="Facebook Account" />
              <Input label="Instagram Account" />
            </div>
          </React.Fragment>
        )}
        {activeStep === 3 && (
          <React.Fragment>
            <Typography variant="h5" color="blue-gray">
              Pricing
            </Typography>
            <div className="tw-mb-6 tw-mt-6 tw-flex tw-w-full tw-flex-col tw-gap-6 md:tw-flex-row">
              <Input label="Price" />
              <Select color="gray" label="USD">
                <Option>BTC</Option>
                <Option>CNY</Option>
                <Option>EUR</Option>
                <Option>GBP</Option>
                <Option>INR</Option>
                <Option>USD</Option>
              </Select>
              <Input label="SKU" />
            </div>
            <Textarea label="Tags" />
          </React.Fragment>
        )}
      </CardBody>
      <CardFooter className="tw-flex tw-justify-between">
        <Button
          color="gray"
          variant="gradient"
          onClick={handlePrev}
          disabled={isFirstStep}
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
