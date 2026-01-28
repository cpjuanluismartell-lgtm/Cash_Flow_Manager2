import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import { formatDateToMonthYear } from '../../utils/formatters';
import { exportToCsv } from '../../utils/csvExport';
import Button from '../ui/Button';
import TransactionTooltip from '../ui/TransactionTooltip';

interface TransactionDetail {
  date: string;
  description: string;
  amount: number;
}

const sortGuidesByName = (a: [string, any], b: [string, any]): number => {
    const getNum = (name: string) => {
        const match = name.match(/^(\d+)-/);
        return match ? parseInt(match[1], 10) : Infinity;
    };
    const numA = getNum(a[0]);
    const numB = getNum(b[0]);

    if (numA !== Infinity && numB !== Infinity) {
        if (numA !== numB) return numA - numB;
    }
    if (numA !== Infinity && numB === Infinity) return -1;
    if (numA === Infinity && numB !== Infinity) return 1;
    
    return a[0].localeCompare(b[0]);
};

const MonthlyFlowView: React.FC = () => {
    const { transactions, guides } = useAppContext();
    const [useME, setUseME] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [modalTransactions, setModalTransactions] = useState<TransactionDetail[] | null>(null);
    const [isFullDetailView, setIsFullDetailView] = useState(false);

    const amountField = useME ? 'amountME' : 'amountMN';
    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    
    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
    const guideNameMap = useMemo(() => new Map(guides.map(g => [g.name, g.id])), [guides]);
    const getGuideName = (id: string) => guideMap.get(id) || 'Sin Categoría';

    const handleCellClick = (guideName: string, month: string, amount: number | undefined) => {
        if (!amount && amount !== 0) return; // Allow clicking on 0 if it's explicitly rendered (transfers)
        
        const guideId = guideNameMap.get(guideName);
        if (!guideId) return;

        const details = transactions
            .filter(t => t.guide === guideId && t.date.substring(0, 7) === month)
            .map(t => ({
                date: t.date,
                description: t.description,
                amount: t[amountField]
            }));

        if (details.length > 0) {
            setModalTransactions(details);
        }
    };

    const flowData = useMemo(() => {
        const months: string[] = Array.from({ length: 12 }, (_, i) => {
            const month = (i + 1).toString().padStart(2, '0');
            return `${selectedYear}-${month}`;
        });

        const initialBalance = transactions
            .filter(t => new Date(t.date).getFullYear() < selectedYear)
            .reduce((acc, t) => acc + t[amountField], 0);

        const yearlyTransactions = transactions.filter(t => t.date && new Date(t.date).getFullYear() === selectedYear);

        const dataByGuide = new Map<string, { [month: string]: number }>();
        
        // Pre-populate guide map to ensure consistent ordering if needed, or build dynamically
        yearlyTransactions.forEach(t => {
            const month = t.date.substring(0, 7);
            const guideName = getGuideName(t.guide);
            if (!dataByGuide.has(guideName)) {
                dataByGuide.set(guideName, {});
            }
            const guideData = dataByGuide.get(guideName)!;
            guideData[month] = (guideData[month] || 0) + t[amountField];
        });

        const monthlyTotals = new Map<string, { income: number, expense: number, net: number }>();
        months.forEach(month => {
            monthlyTotals.set(month, { income: 0, expense: 0, net: 0 });
        });

        const transferGuideId = '13';

        yearlyTransactions.forEach(t => {
            const month = t.date.substring(0, 7);
            const totals = monthlyTotals.get(month);
            if (totals) {
                if (t.guide === transferGuideId) {
                    // Transfer Logic: Both income and expense parts are summed into 'income' total
                    // This effectively nets them out in the Total Ingresos line.
                    totals.income += t[amountField];
                } else {
                    if (t.type === TransactionType.Income) {
                        totals.income += t[amountField];
                    } else {
                        totals.expense += t[amountField];
                    }
                }
                totals.net += t[amountField];
            }
        });

        return { months, dataByGuide, monthlyTotals, initialBalance };
    }, [transactions, guides, amountField, selectedYear]);

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined) return ''; // Distinct undefined from 0
        if (value === 0) return '$0.00'; // Explicitly show 0 for clarity in transfers if needed, or standard formatting
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };
    
    // Custom formatter for the table cells to hide 0s for non-transfers if desired, or follow standard behavior
    const displayCurrency = (value: number | undefined) => {
         if (value === undefined || value === 0) return '';
         return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    }

    const transferGuideName = getGuideName('13');

    const handleExport = () => {
        const headers = ['Categoría', ...flowData.months.map(month => formatDateToMonthYear(month))];
        const rows: (string | number | undefined)[][] = [];

        // Saldo Inicial
        let csvRunningBalance = flowData.initialBalance;
        const initialBalanceRow: (string | number)[] = ['Saldo Inicial'];
        flowData.months.forEach(month => {
            initialBalanceRow.push(csvRunningBalance);
            const monthlyNet = flowData.monthlyTotals.get(month)?.net || 0;
            csvRunningBalance += monthlyNet;
        });
        rows.push(initialBalanceRow);

        // Ingresos
        rows.push(['INGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([guideName, data]) => {
                if (guideName === transferGuideName) return true;
                return Object.values(data).some(v => typeof v === 'number' && v > 0);
            })
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.months.forEach(month => {
                    const value = data[month];
                    // For transfers show any value, for others show positive
                    const shouldShow = (guideName === transferGuideName && value !== undefined) || (value !== undefined && value > 0);
                    const val = shouldShow ? value : undefined;
                    row.push(val);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string | number | undefined)[] = ['Total Ingresos'];
        flowData.months.forEach(month => {
            totalIncomeRow.push(flowData.monthlyTotals.get(month)?.income);
        });
        rows.push(totalIncomeRow);

        // Egresos
        rows.push(['EGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([guideName, data]) => {
                if (guideName === transferGuideName) return false; // Exclude transfers from Egresos
                return Object.values(data).some(v => typeof v === 'number' && v < 0);
            })
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.months.forEach(month => {
                    const value = (typeof data[month] === 'number' && data[month] < 0) ? data[month] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string | number | undefined)[] = ['Total Egresos'];
        flowData.months.forEach(month => {
            totalExpenseRow.push(flowData.monthlyTotals.get(month)?.expense);
        });
        rows.push(totalExpenseRow);

        // Saldo Final
        let csvFinalBalance = flowData.initialBalance;
        const finalBalanceRow: (string | number)[] = ['Saldo Final'];
        flowData.months.forEach(month => {
            const monthlyNet = flowData.monthlyTotals.get(month)?.net || 0;
            csvFinalBalance += monthlyNet;
            finalBalanceRow.push(csvFinalBalance);
        });
        rows.push(finalBalanceRow);

        exportToCsv(`flujo_mensual_${selectedYear}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
    };

    let runningBalance = flowData.initialBalance;

    return (
        <div className="space-y-4">
             {modalTransactions && (
                <TransactionTooltip
                    isOpen={!!modalTransactions}
                    transactions={modalTransactions}
                    onClose={() => setModalTransactions(null)}
                    currency={currency}
                    locale={locale}
                    isFullDetail={isFullDetailView}
                />
            )}
             <Card>
                <div className="flex flex-wrap justify-between items-center gap-4">
                    <Button onClick={handleExport}>
                        Exportar a CSV
                    </Button>
                    <div className="flex items-center space-x-2">
                        <Button onClick={() => setSelectedYear(y => y - 1)} size="sm" variant="secondary">{'<'}</Button>
                        <span className="font-semibold text-lg w-20 text-center">{selectedYear}</span>
                        <Button onClick={() => setSelectedYear(y => y + 1)} size="sm" variant="secondary">{'>'}</Button>
                    </div>
                     <div className="flex items-center gap-4">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="monthly-flow-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="monthly-flow-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="monthly-flow-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="monthly-flow-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Ver en Moneda Extranjera
                            </label>
                        </div>
                    </div>
                </div>
            </Card>
            <Card className="overflow-x-auto p-0 sm:p-0">
                <table className="w-full min-w-max text-sm whitespace-nowrap">
                    <thead className="bg-primary-600 text-white sticky top-0 z-20">
                        <tr>
                            <th className="p-2 text-left font-semibold sticky left-0 bg-primary-600 z-30">Categoría</th>
                            {flowData.months.map(month => <th key={month} className="p-2 text-right font-semibold">{formatDateToMonthYear(month)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr className="bg-gray-100 dark:bg-gray-800 font-bold sticky top-9 z-20">
                            <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30">Saldo Inicial</td>
                            {flowData.months.map(month => {
                                const balanceToShow = runningBalance;
                                const monthlyNet = flowData.monthlyTotals.get(month)?.net || 0;
                                runningBalance += monthlyNet;
                                return <td key={month} className="p-2 text-right">{displayCurrency(balanceToShow)}</td>
                            })}
                        </tr>

                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.months.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                            .sort(sortGuidesByName)
                            .filter(([guideName, data]) => {
                                if (guideName === transferGuideName) return true;
                                return Object.values(data).some(v => typeof v === 'number' && v > 0);
                            })
                            .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.months.map(month => {
                                    const value = data[month];
                                    const isTransfer = guideName === transferGuideName;
                                    // Show if transfer (any value, even 0 or negative) OR positive
                                    const shouldShow = isTransfer ? (value !== undefined) : (value !== undefined && value > 0);
                                    const val = shouldShow ? value : undefined;
                                    const colorClass = (val && val < 0) ? 'text-red-600' : 'text-green-600';
                                    
                                    // Using displayCurrency for non-transfers or special handling for transfers if needed
                                    const text = isTransfer && val === 0 ? '$0.00' : displayCurrency(val);

                                    return <td key={month} onClick={() => handleCellClick(guideName, month, val)} className={`p-2 text-right ${colorClass} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700`}>{text}</td>
                                })}
                            </tr>
                        ))}
                        <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.months.map(month => <td key={month} className="p-2 text-right text-green-700">{displayCurrency(flowData.monthlyTotals.get(month)?.income)}</td>)}
                        </tr>


                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.months.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                        .sort(sortGuidesByName)
                        .filter(([guideName, data]) => {
                            if (guideName === transferGuideName) return false;
                            return Object.values(data).some(v => typeof v === 'number' && v < 0);
                        })
                        .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.months.map(month => {
                                    const value = (typeof data[month] === 'number' && data[month] < 0) ? data[month] : undefined;
                                    return <td key={month} onClick={() => handleCellClick(guideName, month, value)} className="p-2 text-right text-red-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{displayCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.months.map(month => <td key={month} className="p-2 text-right text-red-700">{displayCurrency(flowData.monthlyTotals.get(month)?.expense)}</td>)}
                        </tr>
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Saldo Final</td>
                            {(() => {
                                let finalRunningBalance = flowData.initialBalance;
                                return flowData.months.map(month => {
                                    const monthlyNet = flowData.monthlyTotals.get(month)?.net || 0;
                                    finalRunningBalance += monthlyNet;
                                    return <td key={month} className="p-2 text-right">{displayCurrency(finalRunningBalance)}</td>
                                });
                            })()}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default MonthlyFlowView;
