import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Transaction, TransactionType } from '../../types';
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

const DailyFlowView: React.FC = () => {
    const { transactions, guides } = useAppContext();
    const [startDateFilter, setStartDateFilter] = useState<string | null>(null);
    const [endDateFilter, setEndDateFilter] = useState<string | null>(null);
    const [useME, setUseME] = useState(false);
    const [modalTransactions, setModalTransactions] = useState<TransactionDetail[] | null>(null);
    const [isFullDetailView, setIsFullDetailView] = useState(false);

    const amountField = useME ? 'amountME' : 'amountMN';
    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    
    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
    const guideNameMap = useMemo(() => new Map(guides.map(g => [g.name, g.id])), [guides]);
    const getGuideName = (id: string) => guideMap.get(id) || 'Sin Categoría';

    const handleCellClick = (guideName: string, date: string, amount: number | undefined) => {
        if (!amount) return;

        const guideId = guideNameMap.get(guideName);
        if (!guideId) return;

        const details = transactions
            .filter(t => t.guide === guideId && t.date === date)
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
        const transferGuideId = '13';
        const validTransactions = transactions.filter(t => t.date && !isNaN(new Date(t.date).getTime()));
        if (validTransactions.length === 0) return { dates: [], dataByGuide: new Map(), dailyTotals: new Map(), initialBalance: 0 };

        const initialBalance = validTransactions
            .filter(t => startDateFilter && new Date(t.date) < new Date(startDateFilter))
            .reduce((acc, t) => acc + t[amountField], 0);

        const filteredTransactions = validTransactions.filter(t => {
            const date = new Date(t.date);
            const start = startDateFilter ? new Date(startDateFilter) : null;
            const end = endDateFilter ? new Date(endDateFilter) : null;
            if (start && date < start) return false;
            if (end && date > end) return false;
            return true;
        });

        if (filteredTransactions.length === 0) {
            return { dates: [], dataByGuide: new Map(), dailyTotals: new Map(), initialBalance };
        }

        const sorted = [...filteredTransactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const tableStartDate = startDateFilter ? new Date(startDateFilter) : new Date(sorted[0].date);
        const tableEndDate = endDateFilter ? new Date(endDateFilter) : new Date(sorted[sorted.length - 1].date);
        
        const dates: string[] = [];
        if (!isNaN(tableStartDate.getTime()) && !isNaN(tableEndDate.getTime())) {
             for (let d = new Date(tableStartDate); d <= tableEndDate; d.setDate(d.getDate() + 1)) {
                dates.push(d.toISOString().split('T')[0]);
            }
        }

        const dataByGuide = new Map<string, { [date: string]: number }>();
        const dailyTotals = new Map<string, { income: number, expense: number, net: number }>();
        const dailyNetTransfers = new Map<string, number>();

        dates.forEach(date => {
            dailyTotals.set(date, { income: 0, expense: 0, net: 0 });
        });

        // First, net out the transfers for each day
        sorted.forEach(t => {
            if (t.guide === transferGuideId) {
                dailyNetTransfers.set(t.date, (dailyNetTransfers.get(t.date) || 0) + t[amountField]);
            }
        });

        // Now, process all non-transfer transactions for dataByGuide and totals
        sorted.forEach(t => {
            if (t.guide !== transferGuideId) {
                const guideName = getGuideName(t.guide);
                if (!dataByGuide.has(guideName)) {
                    dataByGuide.set(guideName, {});
                }
                const guideData = dataByGuide.get(guideName)!;
                guideData[t.date] = (guideData[t.date] || 0) + t[amountField];
                
                const totals = dailyTotals.get(t.date);
                if (totals) {
                    if (t.type === TransactionType.Income) {
                        totals.income += t[amountField];
                    } else {
                        totals.expense += t[amountField];
                    }
                    totals.net += t[amountField];
                }
            }
        });

        // Finally, add the netted transfers to dataByGuide and dailyTotals
        if (dailyNetTransfers.size > 0) {
            const transferGuideName = getGuideName(transferGuideId);
            if (!dataByGuide.has(transferGuideName)) {
                dataByGuide.set(transferGuideName, {});
            }
            const transferGuideData = dataByGuide.get(transferGuideName)!;
            
            dailyNetTransfers.forEach((netAmount, date) => {
                // Set the net amount for the transfer guide
                transferGuideData[date] = netAmount;

                // Update daily totals with the net transfer amount
                const totals = dailyTotals.get(date);
                if (totals) {
                    totals.income += netAmount;
                    totals.net += netAmount;
                }
            });
        }

        return { dates, dataByGuide, dailyTotals, initialBalance };
    }, [transactions, guides, startDateFilter, endDateFilter, amountField]);

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === 0) return '';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };
    
    const handleExport = () => {
        const headers = ['Categoría', ...flowData.dates.map(date => formatDateToDDMMYYYY(date))];

        const rows: (string | number | undefined)[][] = [];

        // Saldo Inicial
        let csvRunningBalance = flowData.initialBalance;
        const initialBalanceRow: (string | number)[] = ['Saldo Inicial'];
        flowData.dates.forEach(date => {
            initialBalanceRow.push(csvRunningBalance);
            const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
            csvRunningBalance += dailyNet;
        });
        rows.push(initialBalanceRow);

        // Ingresos
        rows.push(['INGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v > 0))
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.dates.forEach(date => {
                    const value = (typeof data[date] === 'number' && data[date] > 0) ? data[date] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string | number | undefined)[] = ['Total Ingresos'];
        flowData.dates.forEach(date => {
            totalIncomeRow.push(flowData.dailyTotals.get(date)?.income);
        });
        rows.push(totalIncomeRow);

        // Egresos
        rows.push(['EGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v < 0))
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.dates.forEach(date => {
                    const value = (typeof data[date] === 'number' && data[date] < 0) ? data[date] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string | number | undefined)[] = ['Total Egresos'];
        flowData.dates.forEach(date => {
            totalExpenseRow.push(flowData.dailyTotals.get(date)?.expense);
        });
        rows.push(totalExpenseRow);

        // Saldo Final
        let csvFinalBalance = flowData.initialBalance;
        const finalBalanceRow: (string | number)[] = ['Saldo Final'];
        flowData.dates.forEach(date => {
            const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
            csvFinalBalance += dailyNet;
            finalBalanceRow.push(csvFinalBalance);
        });
        rows.push(finalBalanceRow);

        exportToCsv(`flujo_diario_${new Date().toISOString().split('T')[0]}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
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
                <div className="flex flex-wrap items-end gap-4 justify-between">
                    <div className="flex flex-wrap items-end gap-4">
                        <Input type="date" label="Fecha de Inicio" value={startDateFilter || ''} onChange={e => setStartDateFilter(e.target.value)} />
                        <Input type="date" label="Fecha de Fin" value={endDateFilter || ''} onChange={e => setEndDateFilter(e.target.value)} />
                        <Button onClick={() => { setStartDateFilter(null); setEndDateFilter(null); }} variant="secondary">
                            Mostrar Todos
                        </Button>
                        <Button onClick={handleExport}>
                            Exportar a CSV
                        </Button>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="daily-flow-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="daily-flow-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="daily-flow-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="daily-flow-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                            {flowData.dates.map(date => <th key={date} className="p-2 text-right font-semibold">{formatDateToDDMMYYYY(date)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr className="bg-gray-100 dark:bg-gray-800 font-bold sticky top-9 z-20">
                            <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30">Saldo Inicial</td>
                            {flowData.dates.map((date) => {
                                const balanceToShow = runningBalance;
                                const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
                                runningBalance += dailyNet;
                                return <td key={date} className="p-2 text-right">{formatCurrency(balanceToShow)}</td>
                            })}
                        </tr>

                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.dates.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                            .sort(sortGuidesByName)
                            .filter(([guideName, data]) => {
                                if (guideName === getGuideName('13')) {
                                    // Show transfers if there's any non-zero net value.
                                    return Object.values(data).some(v => typeof v === 'number' && v !== 0);
                                }
                                // For other guides, show only if there are positive values.
                                return Object.values(data).some(v => typeof v === 'number' && v > 0);
                            })
                            .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.dates.map(date => {
                                    const isTransfer = guideName === getGuideName('13');
                                    const value = data[date];
                                    let valueToShow: number | undefined;

                                    if (isTransfer) {
                                        // For transfers, show the net amount.
                                        valueToShow = typeof value === 'number' ? value : undefined;
                                    } else {
                                        // For others, only show positive amounts in the income section.
                                        valueToShow = (typeof value === 'number' && value > 0) ? value : undefined;
                                    }

                                    const color = (typeof valueToShow === 'number' && valueToShow < 0) ? 'text-red-600' : 'text-green-600';

                                    return (<td key={date} onClick={() => handleCellClick(guideName, date, valueToShow)} className={`p-2 text-right cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${color}`}>{formatCurrency(valueToShow)}</td>);
                                })}
                            </tr>
                        ))}
                        <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.dates.map(date => <td key={date} className="p-2 text-right text-green-700">{formatCurrency(flowData.dailyTotals.get(date)?.income)}</td>)}
                        </tr>


                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.dates.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                            .sort(sortGuidesByName)
                            .filter(([guideName, data]) => {
                                // Explicitly exclude transfers from the expense section.
                                if (guideName === getGuideName('13')) {
                                    return false;
                                }
                                // For other guides, show if there are negative values.
                                return Object.values(data).some(v => typeof v === 'number' && v < 0);
                            })
                            .map(([guideName, data]) => (
                                <tr key={guideName} className="bg-white dark:bg-gray-800">
                                    <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                    {flowData.dates.map(date => {
                                      const value = typeof data[date] === 'number' && data[date] < 0 ? data[date] : undefined;
                                      return <td key={date} onClick={() => handleCellClick(guideName, date, value)} className="p-2 text-right text-red-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{formatCurrency(value)}</td>
                                    })}
                                </tr>
                        ))}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.dates.map(date => <td key={date} className="p-2 text-right text-red-700">{formatCurrency(flowData.dailyTotals.get(date)?.expense)}</td>)}
                        </tr>
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Saldo Final</td>
                            {(() => {
                                let finalRunningBalance = flowData.initialBalance;
                                return flowData.dates.map(date => {
                                    const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
                                    finalRunningBalance += dailyNet;
                                    return <td key={date} className="p-2 text-right">{formatCurrency(finalRunningBalance)}</td>
                                });
                            })()}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default DailyFlowView;
