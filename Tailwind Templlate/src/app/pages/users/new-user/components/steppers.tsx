// @ts-nocheck
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
  Select,
  Option,
  Textarea,
  Stepper,
  Step,
  Button,
} from "@material-tailwind/react";

// zod
import z from "zod";

// react-hook-form
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

// validation
const stepOneValidationSchema = z
  .object({
    firstName: z
      .string({
        message: "First name should be string!",
      })
      .min(1, { message: "First name is required!" }),
    lastName: z
      .string({
        message: "Last name should be string!",
      })
      .min(1, { message: "Last name is required!" }),
    email: z
      .string({
        message: "Email address should be string!",
      })
      .min(1, { message: "Email address is required!" })
      .email({
        message: "Invalid email address!",
      }),
    company: z
      .string({
        message: "Company should be string!",
      })
      .optional(),
    password: z
      .string({
        message: "Password should be string!",
      })
      .min(8, {
        message: "Password should be at least 8 characters!",
      }),
    confirmPassword: z
      .string({
        message: "Confirm Password should be string!",
      })
      .min(8, {
        message: "Confirm Password should be at least 8 characters!",
      }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Password don't match.",
  });

const stepTwoValidationSchema = z.object({
  address: z
    .string({
      message: "Address is required.",
    })
    .min(1, { message: "Address is required!" }),
  city: z
    .string({
      message: "City is required.",
    })
    .min(1, { message: "City is required!" }),
  zip: z
    .string({
      message: "Zip is required.",
    })
    .min(1, { message: "Zip is required!" }),
});

const stepThreeValidationSchema = z.object({
  twitter: z
    .string({
      message: "Twitter is required.",
    })
    .min(1, { message: "Twitter profile is required!" }),
});

const InputWithLabel = React.forwardRef(({ error, ...rest }, ref) => {
  return (
    <div className="tw-w-full">
      <Input ref={ref} error={Boolean(error)} {...rest} />
      {error && (
        <Typography
          color="red"
          variant="small"
          className="tw-mt-1.5 tw-inline-block tw-text-xs !tw-font-normal"
        >
          {error}
        </Typography>
      )}
    </div>
  );
});

const schemas = [
  stepOneValidationSchema,
  stepTwoValidationSchema,
  stepThreeValidationSchema,
];

type Props = {};

export default function Steppers({}: Props) {
  const [data, setData] = React.useState({});
  const [activeStep, setActiveStep] = React.useState(0);
  const [isLastStep, setIsLastStep] = React.useState(false);
  const [isFirstStep, setIsFirstStep] = React.useState(false);

  const {
    register,
    handleSubmit,
    trigger,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schemas[activeStep]) });

  const handleStep1 = async () => {
    const isInvalidAboutMe = await trigger([
      "firstName",
      "lastName",
      "email",
      "password",
      "confirmPassword",
    ]);

    if (!isInvalidAboutMe) {
      return;
    }

    setActiveStep((cur) => cur + 1);
  };

  const handleStep2 = async () => {
    const isInvalidAddress = await trigger(["address", "city", "zip"]);

    if (!isInvalidAddress) {
      return;
    }

    setActiveStep((cur) => cur + 1);
  };

  const handleStep3 = async () => {
    const isInvalidTwitter = await trigger(["twitter"]);

    if (!isInvalidTwitter) {
      return;
    }

    setActiveStep((cur) => cur + 1);
  };

  const onSubmit = (data) => console.log(data);
  const handleNext = () => !isLastStep && setActiveStep((cur) => cur + 1);
  const handlePrev = () => !isFirstStep && setActiveStep((cur) => cur - 1);

  const handlers = [handleStep1, handleStep2, handleStep3, handleNext];

  return (
    <Card className="tw-w-full tw-max-w-4xl tw-border tw-border-blue-gray-100 tw-shadow-sm">
      <CardHeader
        floated={false}
        shadow={false}
        variant="gradient"
        color="gray"
        className="tw-grid tw-h-24 tw-place-items-center"
      >
        <div className="tw-w-full tw-px-20 tw-pt-4 tw-pb-8">
          <Stepper
            activeStep={activeStep}
            isLastStep={(value) => setIsLastStep(value)}
            isFirstStep={(value) => setIsFirstStep(value)}
            lineClassName="bg-white/50"
            activeLineClassName="bg-white"
          >
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
            >
              <div className="tw-absolute -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography color="inherit">About</Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
            >
              <div className="tw-absolute -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography color="inherit">Address</Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
            >
              <div className="tw-absolute -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography color="inherit">Social</Typography>
              </div>
            </Step>
            <Step
              className="tw-h-4 tw-w-4 !tw-bg-blue-gray-50 tw-text-white/75"
              activeClassName="tw-ring-0 !tw-bg-white tw-text-white"
              completedClassName="!tw-bg-white tw-text-white"
            >
              <div className="tw-absolute -tw-bottom-[2.3rem] tw-w-max tw-text-center tw-text-xs">
                <Typography color="inherit">Profile</Typography>
              </div>
            </Step>
          </Stepper>
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardBody className="tw-flex tw-flex-col">
          {activeStep === 0 && (
            <React.Fragment>
              <Typography variant="h5" color="blue-gray">
                About Me
              </Typography>
              <Typography variant="small" className="!tw-font-normal">
                Mandatory informations
              </Typography>
              <div className="tw-my-6 tw-flex tw-w-full tw-flex-col tw-items-end tw-gap-6 lg:tw-flex-row">
                <InputWithLabel
                  label="First Name"
                  error={errors?.firstName?.message}
                  {...register("firstName")}
                  onBlur={async () => await trigger("firstName")}
                />
                <InputWithLabel
                  label="Last Name"
                  error={errors?.lastName?.message}
                  {...register("lastName")}
                  onBlur={async () => await trigger("lastName")}
                />
              </div>
              <div className="tw-mb-6 tw-flex tw-w-full tw-flex-col tw-items-end tw-gap-6 lg:tw-flex-row">
                <InputWithLabel
                  label="Company"
                  error={errors?.company?.message}
                  {...register("company")}
                />
                <InputWithLabel
                  label="Email Address"
                  error={errors?.email?.message}
                  {...register("email")}
                  onBlur={async () => await trigger("email")}
                />
              </div>
              <div className="tw-flex tw-w-full tw-flex-col tw-items-end tw-gap-6 lg:tw-flex-row">
                <InputWithLabel
                  label="Password"
                  error={errors?.password?.message}
                  {...register("password")}
                  onBlur={async () => await trigger("password")}
                />
                <InputWithLabel
                  label="Confirm Password"
                  error={errors?.confirmPassword?.message}
                  {...register("confirmPassword")}
                  onBlur={async () => await trigger("confirmPassword")}
                />
              </div>
            </React.Fragment>
          )}
          {activeStep === 1 && (
            <React.Fragment>
              <Typography variant="h5" color="blue-gray">
                Address
              </Typography>
              <div className="tw-mb-6 tw-mt-4 tw-flex tw-w-full tw-flex-col tw-gap-6">
                <InputWithLabel
                  label="Address 1"
                  error={errors?.address?.message}
                  {...register("address")}
                  onBlur={async () => await trigger("address")}
                />
                <Input label="Address 2" />
              </div>
              <div className="tw-flex tw-w-full tw-flex-col tw-gap-6 lg:tw-flex-row">
                <InputWithLabel
                  label="City"
                  error={errors?.city?.message}
                  {...register("city")}
                  onBlur={async () => await trigger("city")}
                />
                <Select color="gray" label="State">
                  <Option>State 1</Option>
                  <Option>State 2</Option>
                  <Option>State 3</Option>
                </Select>
                <InputWithLabel
                  label="Zip"
                  error={errors?.zip?.message}
                  {...register("zip")}
                  onBlur={async () => await trigger("zip")}
                />
              </div>
            </React.Fragment>
          )}
          {activeStep === 2 && (
            <React.Fragment>
              <Typography variant="h5" color="blue-gray">
                Socials
              </Typography>
              <div className="tw-mt-4 tw-flex tw-w-full tw-flex-col tw-gap-6">
                <InputWithLabel
                  label="Twitter Handle"
                  error={errors?.twitter?.message}
                  {...register("twitter")}
                  onBlur={async () => await trigger("twitter")}
                />
                <Input label="Facebook Account" />
                <Input label="Instagram Account" />
              </div>
            </React.Fragment>
          )}
          {activeStep === 3 && (
            <React.Fragment>
              <Typography variant="h5" color="blue-gray">
                Profile
              </Typography>
              <div className="tw-mt-4 tw-flex tw-w-full tw-flex-col tw-gap-6">
                <Input label="Public Email" />
                <Textarea label="Message" />
              </div>
            </React.Fragment>
          )}
        </CardBody>
        <CardFooter className="tw-flex tw-justify-between">
          <Button
            variant="gradient"
            color="blue-gray"
            onClick={handlePrev}
            disabled={isFirstStep}
          >
            Prev
          </Button>
          <Button
            variant="gradient"
            onClick={handlers[activeStep]}
            disabled={isLastStep}
            type="submit"
          >
            Next
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

InputWithLabel.displayName = "InputWithLabel";
