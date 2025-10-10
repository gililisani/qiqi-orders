/**
 * OrderStatusBadge Component
 * 
 * Displays order status with the new Option 5 design:
 * - Subtle opacity backgrounds
 * - Nice borders for definition
 * - Regular font weight
 * - Green-400 for Done status
 */

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

export default function OrderStatusBadge({ status, className = '' }: OrderStatusBadgeProps) {
  const getStatusClasses = (status: string): string => {
    switch (status) {
      case 'Draft':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-gray-400/15 text-gray-600 border border-gray-200';
      case 'Open':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-gray-400/20 text-gray-700 border border-gray-300';
      case 'In Process':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-blue-400/20 text-blue-700 border border-blue-300';
      case 'Ready':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-orange-400/20 text-orange-700 border border-orange-300';
      case 'Done':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-green-400/20 text-green-700 border border-green-300';
      case 'Cancelled':
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-pink-400/15 text-pink-700 border border-pink-300';
      default:
        return 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 sm:text-xs/5 forced-colors:outline !bg-gray-400/20 text-gray-700 border border-gray-300';
    }
  };

  return (
    <span className={`${getStatusClasses(status)} ${className}`}>
      {status}
    </span>
  );
}

