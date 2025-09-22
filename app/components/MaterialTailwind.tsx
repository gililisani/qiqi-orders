"use client";

// Re-export all Material Tailwind components with proper typing
export * from "@material-tailwind/react";

// For TypeScript compatibility, we'll create wrapper components that handle the required props
import React from 'react';
import {
  Typography as MTTypography,
  Card as MTCard,
  CardBody as MTCardBody,
  CardHeader as MTCardHeader,
  Button as MTButton,
  Chip as MTChip,
  Spinner as MTSpinner,
  List as MTList,
  ListItem as MTListItem,
  ListItemPrefix as MTListItemPrefix,
  Accordion as MTAccordion,
  AccordionHeader as MTAccordionHeader,
  AccordionBody as MTAccordionBody,
  IconButton as MTIconButton,
  Navbar as MTNavbar,
  Alert as MTAlert,
  Breadcrumbs as MTBreadcrumbs,
} from "@material-tailwind/react";

// Add default props to handle the TypeScript errors
const defaultProps = {
  placeholder: undefined,
  onPointerEnterCapture: undefined,
  onPointerLeaveCapture: undefined,
};

export const Typography = React.forwardRef<any, any>((props, ref) => (
  <MTTypography ref={ref} {...defaultProps} {...props} />
));

export const Card = React.forwardRef<any, any>((props, ref) => (
  <MTCard ref={ref} {...defaultProps} {...props} />
));

export const CardBody = React.forwardRef<any, any>((props, ref) => (
  <MTCardBody ref={ref} {...defaultProps} {...props} />
));

export const CardHeader = React.forwardRef<any, any>((props, ref) => (
  <MTCardHeader ref={ref} {...defaultProps} {...props} />
));

export const Button = React.forwardRef<any, any>((props, ref) => (
  <MTButton ref={ref} {...defaultProps} {...props} />
));

export const Chip = React.forwardRef<any, any>((props, ref) => (
  <MTChip ref={ref} {...defaultProps} {...props} />
));

export const Spinner = React.forwardRef<any, any>((props, ref) => (
  <MTSpinner ref={ref} {...defaultProps} {...props} />
));

export const List = React.forwardRef<any, any>((props, ref) => (
  <MTList ref={ref} {...defaultProps} {...props} />
));

export const ListItem = React.forwardRef<any, any>((props, ref) => (
  <MTListItem ref={ref} {...defaultProps} {...props} />
));

export const ListItemPrefix = React.forwardRef<any, any>((props, ref) => (
  <MTListItemPrefix ref={ref} {...defaultProps} {...props} />
));

export const Accordion = React.forwardRef<any, any>((props, ref) => (
  <MTAccordion ref={ref} {...defaultProps} {...props} />
));

export const AccordionHeader = React.forwardRef<any, any>((props, ref) => (
  <MTAccordionHeader ref={ref} {...defaultProps} {...props} />
));

export const AccordionBody = React.forwardRef<any, any>((props, ref) => (
  <MTAccordionBody ref={ref} {...defaultProps} {...props} />
));

export const IconButton = React.forwardRef<any, any>((props, ref) => (
  <MTIconButton ref={ref} {...defaultProps} {...props} />
));

export const Navbar = React.forwardRef<any, any>((props, ref) => (
  <MTNavbar ref={ref} {...defaultProps} {...props} />
));

export const Alert = React.forwardRef<any, any>((props, ref) => (
  <MTAlert ref={ref} {...defaultProps} {...props} />
));

export const Breadcrumbs = React.forwardRef<any, any>((props, ref) => (
  <MTBreadcrumbs ref={ref} {...defaultProps} {...props} />
));
