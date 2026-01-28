// utils/formatters.ts

/**
 * Converts a date string from YYYY-MM-DD format to DD/MM/YYYY format.
 * @param dateStr - The date string in YYYY-MM-DD format.
 * @returns The formatted date string in DD/MM/YYYY format.
 */
export const formatDateToDDMMYYYY = (dateStr: string): string => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr; 
  }
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
};

/**
 * Converts a date string from YYYY-MM-DD format to DD/MM format.
 * @param dateStr - The date string in YYYY-MM-DD format.
 * @returns The formatted date string in DD/MM format.
 */
export const formatDateToDDMM = (dateStr: string): string => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    const [_, month, day] = dateStr.split('-');
    return `${day}/${month}`;
};

/**
 * Converts a date string from YYYY-MM or YYYY-MM-DD format to MM/YYYY format.
 * @param dateStr - The date string.
 * @returns The formatted date string in MM/YYYY format.
 */
export const formatDateToMMYYYY = (dateStr: string): string => {
    const dateParts = dateStr.split('-');
    if (dateParts.length < 2) return dateStr;
    const year = dateParts[0];
    const month = dateParts[1];
    return `${month}/${year}`;
};

/**
 * Converts a date string from YYYY-MM format to "Month YYYY" format in Spanish.
 * @param dateStr - The date string in YYYY-MM format.
 * @returns The formatted date string (e.g., "julio 2025").
 */
export const formatDateToMonthYear = (dateStr: string): string => {
    const dateParts = dateStr.split('-');
    if (dateParts.length < 2) return dateStr;
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);

    if (isNaN(year) || isNaN(month)) return dateStr;

    const date = new Date(year, month - 1, 1);
    // Using Intl.DateTimeFormat for robust, locale-aware month names.
    return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date);
};
