/**
 * Number and Currency Formatting Utilities
 * 
 * Provides consistent formatting for numbers, currencies, and quantities
 * across the entire application with thousand separators.
 */

/**
 * Format a number with thousand separators
 * @param value - The number to format
 * @param decimals - Number of decimal places (default: 0)
 * @returns Formatted string with commas (e.g., "1,234" or "1,234.56")
 */
export function formatNumber(value: number | null | undefined, decimals: number = 0): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }
  
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a currency value with thousand separators
 * @param value - The currency amount to format
 * @param includeCurrencySymbol - Whether to include $ symbol (default: true)
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value: number | null | undefined, includeCurrencySymbol: boolean = true): string {
  if (value === null || value === undefined || isNaN(value)) {
    return includeCurrencySymbol ? '$0.00' : '0.00';
  }
  
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  return includeCurrencySymbol ? `$${formatted}` : formatted;
}

/**
 * Format a quantity with thousand separators
 * @param value - The quantity to format
 * @returns Formatted quantity string (e.g., "1,234")
 */
export function formatQuantity(value: number | null | undefined): string {
  return formatNumber(value, 0);
}

/**
 * Format a percentage value
 * @param value - The percentage value (e.g., 0.15 for 15%)
 * @param decimals - Number of decimal places (default: 1)
 * @returns Formatted percentage string (e.g., "15.0%")
 */
export function formatPercentage(value: number | null | undefined, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }
  
  const percentage = value * 100;
  return `${formatNumber(percentage, decimals)}%`;
}

