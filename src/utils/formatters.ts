/**
 * Formats a numeric value into a localized currency string.
 */
const currencyFormatterCache = new Map<string, Intl.NumberFormat>();

export const formatCurrency = (amount: number, currency: string = "EUR"): string => {
  const key = `en-US:${currency}`;
  if (!currencyFormatterCache.has(key)) {
    currencyFormatterCache.set(
      key,
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }),
    );
  }

  return currencyFormatterCache.get(key)!.format(amount);
};

/**
 * Formats an ISO date string into a localized short date.
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};
