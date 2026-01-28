import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { TransactionType } from '../../types';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';
import TransactionTooltip from '../ui/TransactionTooltip';
import { formatDateToDDMMYYYY } from '../../utils/formatters';
import { exportToCsv } from '../../utils/csvExport';

interface TransactionDetail {
  date: string;
  description: string;
  amount: number;
}

const getWeekStartDate = (dateStr: string): string => {
    // The week starts on Saturday.
    const date = new Date(dateStr + 'T12:00:00Z');
    if (isNaN(date.getTime())) {
        const today = new Date();
        const offset = (today.getUTCDay() + 1) % 7; 
        const saturday = new Date(today.setUTCDate(today.getUTCDate() - offset));
        return saturday.toISOString().split('T')[0];
    }
    // Saturday is 6, Sunday is 0. (day + 1) % 7 gives the offset from Saturday.
    const offset = (date.getUTCDay() + 1) % 7;
    const saturday = new Date(date.setUTCDate(date.getUTCDate() - offset));
    return saturday.toISOString().split('T')[0];
};

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

const RealWeeklyFlowView: React.FC = () => {
    const { transactions, guides } = useAppContext();
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [useME, setUseME] = useState(false);
    const [modalTransactions, setModalTransactions] = useState<TransactionDetail[] | null>(null);
    const [isFullDetailView, setIsFullDetailView] = useState(false);

    const amountField = useME ? 'amountME' : 'amountMN';
    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    
    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
    const guideNameMap = useMemo(() => new Map(guides.map(g => [g.name, g.id])), [guides]);
    const getGuideName = (id: string) => guideMap.get(id) || 'Sin Categoría';

    const handleCellClick = (guideName: string, colKey: string, amount: number | undefined) => {
        if (!amount) return;
        
        const guideId = guideNameMap.get(guideName);
        if (!guideId) return;

        const isDaily = !!selectedDate;
        let details: TransactionDetail[] = [];

        if (isDaily) {
             // colKey is YYYY-MM-DD
             details = transactions
                .filter(t => t.guide === guideId && t.date === colKey)
                .map(t => ({
                    date: t.date,
                    description: t.description,
                    amount: t[amountField]
                }));
        } else {
             // colKey is week start date
            const weekStartDate = new Date(colKey + 'T12:00:00Z');
            const weekEndDate = new Date(weekStartDate);
            weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);

            details = transactions
                .filter(t => {
                    const tDate = new Date(t.date + 'T12:00:00Z');
                    return t.guide === guideId && tDate >= weekStartDate && tDate < weekEndDate;
                })
                .map(t => ({
                    date: t.date,
                    description: t.description,
                    amount: t[amountField]
                }));
        }

        if (details.length > 0) {
            setModalTransactions(details);
        }
    };

    const formatWeekHeader = (startDateStr: string) => {
        const startDate = new Date(startDateStr + 'T12:00:00Z');
        const endDate = new Date(startDate);
        endDate.setUTCDate(startDate.getUTCDate() + 6); // Saturday + 6 days = Friday

        const startFormatted = formatDateToDDMMYYYY(startDate.toISOString().split('T')[0]);
        const endFormatted = formatDateToDDMMYYYY(endDate.toISOString().split('T')[0]);
        
        return `${startFormatted} al ${endFormatted}`;
    };

    const formatColumnHeader = (colDateStr: string, isDaily: boolean) => {
        if (isDaily) {
             return formatDateToDDMMYYYY(colDateStr);
        } else {
             return formatWeekHeader(colDateStr);
        }
    };

    const flowData = useMemo(() => {
        const validTransactions = transactions.filter(t => t.date && !isNaN(new Date(t.date).getTime()));
        if (validTransactions.length === 0) return { columns: [], dataByGuide: new Map(), totals: new Map(), initialBalance: 0, isDaily: false };

        const sorted = [...validTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const selectedWeekStart = selectedDate ? getWeekStartDate(selectedDate) : null;

        let columns: string[] = [];
        let isDaily = false;
        let filteredTransactions = sorted;
        let initialBalance = 0;

        if (selectedWeekStart) {
            isDaily = true;
            // Generate 7 days for the selected week
            const start = new Date(selectedWeekStart + 'T12:00:00Z');
            for (let i = 0; i < 7; i++) {
                const d = new Date(start);
                d.setUTCDate(start.getUTCDate() + i);
                columns.push(d.toISOString().split('T')[0]);
            }
            
            const weekEndDate = new Date(columns[6] + 'T12:00:00Z'); 
            // Filter transactions for these days
            filteredTransactions = sorted.filter(t => {
                const tDate = new Date(t.date + 'T12:00:00Z');
                const sDate = new Date(columns[0] + 'T12:00:00Z');
                return tDate >= sDate && tDate <= weekEndDate;
            });

            initialBalance = sorted
                .filter(t => new Date(t.date) < new Date(columns[0]))
                .reduce((acc, t) => acc + t[amountField], 0);

        } else {
            // Weekly view logic (existing)
             if (sorted.length > 0) {
                const firstWeekStr = getWeekStartDate(sorted[0].date);
                const lastDate = new Date(sorted[sorted.length - 1].date + 'T12:00:00Z');
                for (let d = new Date(firstWeekStr + 'T12:00:00Z'); d <= lastDate; d.setDate(d.getDate() + 7)) {
                    columns.push(d.toISOString().split('T')[0]);
                }
            }
             
             const firstWeekOfPeriod = columns[0];
             initialBalance = firstWeekOfPeriod ? sorted
                .filter(t => new Date(t.date) < new Date(firstWeekOfPeriod))
                .reduce((acc, t) => acc + t[amountField], 0) : 0;
        }

        const dataByGuide = new Map<string, { [col: string]: number }>();
        const totals = new Map<string, { income: number, expense: number, net: number }>();
        const transferGuideId = '13';
        
        columns.forEach(col => {
            totals.set(col, { income: 0, expense: 0, net: 0 });
        });

        filteredTransactions.forEach(t => {
            let colKey = '';
            if (isDaily) {
                // In daily mode, match exact date if it falls in range
                if (columns.includes(t.date)) {
                    colKey = t.date;
                }
            } else {
                colKey = getWeekStartDate(t.date);
            }

            // Only process if the transaction falls into one of our generated columns
            if (colKey && totals.has(colKey)) {
                const guideName = getGuideName(t.guide);
                if (!dataByGuide.has(guideName)) {
                    dataByGuide.set(guideName, {});
                }
                const guideData = dataByGuide.get(guideName)!;
                guideData[colKey] = (guideData[colKey] || 0) + t[amountField];
                
                const total = totals.get(colKey)!;
                if (t.guide === transferGuideId) {
                    total.income += t[amountField];
                } else {
                    if (t.type === TransactionType.Income) {
                        total.income += t[amountField];
                    } else {
                        total.expense += t[amountField];
                    }
                }
                total.net += t[amountField];
            }
        });

        return { columns, dataByGuide, totals, initialBalance, isDaily };
    }, [transactions, guides, selectedDate, amountField]);


    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === 0) return '';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };
    
    const handleExport = () => {
        const headers = ['Categoría', ...flowData.columns.map(col => formatColumnHeader(col, flowData.isDaily))];
        const rows: (string | number | undefined)[][] = [];
        const transferGuideName = getGuideName('13');

        // Saldo Inicial
        let csvRunningBalance = flowData.initialBalance;
        const initialBalanceRow: (string | number)[] = ['Saldo Inicial'];
        flowData.columns.forEach(col => {
            initialBalanceRow.push(csvRunningBalance);
            const net = flowData.totals.get(col)?.net || 0;
            csvRunningBalance += net;
        });
        rows.push(initialBalanceRow);

        // Ingresos
        rows.push(['INGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([guideName, data]) => {
                if (guideName === transferGuideName) {
                    return Object.values(data).some(v => typeof v === 'number' && v !== 0);
                }
                return Object.values(data).some(v => typeof v === 'number' && v > 0);
            })
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.columns.forEach(col => {
                    const value = data[col];
                    const isTransfer = guideName === transferGuideName;
                    let valueToShow: number | undefined;

                    if (isTransfer) {
                        valueToShow = typeof value === 'number' ? value : undefined;
                    } else {
                        valueToShow = (typeof value === 'number' && value > 0) ? value : undefined;
                    }
                    row.push(valueToShow);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string | number | undefined)[] = ['Total Ingresos'];
        flowData.columns.forEach(col => {
            totalIncomeRow.push(flowData.totals.get(col)?.income);
        });
        rows.push(totalIncomeRow);

        // Egresos
        rows.push(['EGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([guideName, data]) => {
                if (guideName === transferGuideName) return false;
                return Object.values(data).some(v => typeof v === 'number' && v < 0);
            })
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.columns.forEach(col => {
                    const value = (typeof data[col] === 'number' && data[col] < 0) ? data[col] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string | number | undefined)[] = ['Total Egresos'];
        flowData.columns.forEach(col => {
            totalExpenseRow.push(flowData.totals.get(col)?.expense);
        });
        rows.push(totalExpenseRow);

        // Saldo Final
        let csvFinalBalance = flowData.initialBalance;
        const finalBalanceRow: (string | number)[] = ['Saldo Final'];
        flowData.columns.forEach(col => {
            const net = flowData.totals.get(col)?.net || 0;
            csvFinalBalance += net;
            finalBalanceRow.push(csvFinalBalance);
        });
        rows.push(finalBalanceRow);

        exportToCsv(`flujo_${flowData.isDaily ? 'diario_semana' : 'semanal'}_${new Date().toISOString().split('T')[0]}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
    };


    let runningBalance = flowData.initialBalance;
    const transferGuideName = getGuideName('13');

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
                <div className="flex flex-wrap items-end gap-4 justify-between">
                    <div className="flex flex-wrap items-end gap-4">
                        <Input 
                            type="date" 
                            label="Seleccionar Semana" 
                            value={selectedDate || ''} 
                            onChange={e => setSelectedDate(e.target.value)} 
                        />
                        <Button onClick={() => setSelectedDate(null)} variant="secondary">
                            Mostrar Todas las Semanas
                        </Button>
                        <Button onClick={handleExport}>
                            Exportar a CSV
                        </Button>
                    </div>
                     <div className="flex items-center gap-4">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="weekly-flow-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="weekly-flow-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="weekly-flow-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="weekly-flow-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Ver en ME
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
                            {flowData.columns.map(col => (
                                <th key={col} className="p-2 text-right font-semibold">
                                    {formatColumnHeader(col, flowData.isDaily)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr className="bg-gray-100 dark:bg-gray-800 font-bold sticky top-9 z-20">
                            <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30">Saldo Inicial</td>
                            {flowData.columns.map(col => {
                                const balanceToShow = runningBalance;
                                const net = flowData.totals.get(col)?.net || 0;
                                runningBalance += net;
                                return <td key={col} className="p-2 text-right">{formatCurrency(balanceToShow)}</td>
                            })}
                        </tr>

                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.columns.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                            .sort(sortGuidesByName)
                            .filter(([guideName, data]) => {
                                if (guideName === transferGuideName) {
                                    return Object.values(data).some(v => typeof v === 'number' && v !== 0);
                                }
                                return Object.values(data).some(v => typeof v === 'number' && v > 0);
                            })
                            .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.columns.map(col => {
                                    const isTransfer = guideName === transferGuideName;
                                    const value = data[col];
                                    let valueToShow: number | undefined;

                                    if (isTransfer) {
                                        valueToShow = typeof value === 'number' ? value : undefined;
                                    } else {
                                        valueToShow = (typeof value === 'number' && value > 0) ? value : undefined;
                                    }
                                    
                                    const color = (typeof valueToShow === 'number' && valueToShow < 0) ? 'text-red-600' : 'text-green-600';

                                    return <td key={col} onClick={() => handleCellClick(guideName, col, valueToShow)} className={`p-2 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${color}`}>{formatCurrency(valueToShow)}</td>
                                })}
                            </tr>
                        ))}
                         <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.columns.map(col => <td key={col} className="p-2 text-right text-green-700">{formatCurrency(flowData.totals.get(col)?.income)}</td>)}
                        </tr>


                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.columns.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                           .sort(sortGuidesByName)
                           .filter(([guideName, data]) => {
                                if (guideName === transferGuideName) {
                                    return false;
                                }
                                return Object.values(data).some(v => typeof v === 'number' && v < 0);
                            })
                           .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.columns.map(col => {
                                    const value = typeof data[col] === 'number' && data[col] < 0 ? data[col] : undefined
                                    return <td key={col} onClick={() => handleCellClick(guideName, col, value)} className="p-2 text-right text-red-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{formatCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.columns.map(col => <td key={col} className="p-2 text-right text-red-700">{formatCurrency(flowData.totals.get(col)?.expense)}</td>)}
                        </tr>
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Saldo Final</td>
                             {(() => {
                                let finalRunningBalance = flowData.initialBalance;
                                return flowData.columns.map(col => {
                                    const net = flowData.totals.get(col)?.net || 0;
                                    finalRunningBalance += net;
                                    return <td key={col} className="p-2 text-right">{formatCurrency(finalRunningBalance)}</td>
                                });
                             })()}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default RealWeeklyFlowView;
