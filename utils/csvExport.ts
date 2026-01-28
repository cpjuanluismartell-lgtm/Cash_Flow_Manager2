// utils/csvExport.ts

const escapeCsvCell = (cell: string | number | null | undefined): string => {
    if (cell === null || cell === undefined) {
        return '';
    }
    const cellStr = String(cell);
    // If the cell contains a comma, a double-quote, or a newline, wrap it in double-quotes.
    if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
        // Also, any double-quotes inside the cell must be escaped by another double-quote.
        const escapedStr = cellStr.replace(/"/g, '""');
        return `"${escapedStr}"`;
    }
    return cellStr;
};

export const exportToCsv = (filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void => {
    const csvContent = [
        headers.map(escapeCsvCell).join(','),
        ...rows.map(row => row.map(escapeCsvCell).join(','))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' }); // \uFEFF for BOM to handle UTF-8 in Excel

    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};
