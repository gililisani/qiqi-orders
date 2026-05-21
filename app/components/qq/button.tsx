'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
    'disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        // Primary = brand black (default workhorse)
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary',
        // Outline = white with hairline border (secondary actions)
        outline: 'border border-border bg-background text-foreground hover:bg-secondary',
        // Secondary = light filled (tertiary actions)
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // Ghost = no chrome (icon buttons, links inside dense layouts)
        ghost: 'text-foreground hover:bg-secondary',
        // Link = underlined text action
        link: 'text-accent underline-offset-4 hover:underline',
        // Destructive = Qiqi Magenta
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Accent = Qiqi Periwinkle (use sparingly, e.g. signature actions)
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
