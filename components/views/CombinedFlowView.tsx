import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { Transaction, ScheduledPayment, TransactionType } from '../../types';
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

type CombinedFlowItem = {
    date: string;
    concept: string;
    amount: number;
    type: TransactionType;
};

// New structure to hold separated values
type ConceptDailyData = {
    net: number;
    income: number;
    expense: number;
};

const sortConceptsByName = (a: [string, any], b: [string, any]): number => {
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

const CombinedFlowView: React.FC = () => {
    const { transactions, scheduledPayments, guides } = useAppContext();
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

    const handleCellClick = (concept: string, date: string, amount: number | undefined, filterType?: 'income' | 'expense') => {
        if (!amount) return;
        
        const guideId = guideNameMap.get(concept);
        let details: { date: string, description: string, amount: number }[] = [];
        const transferGuideName = getGuideName('13');

        const matchesFilter = (amt: number) => {
            if (concept === transferGuideName) return true; // Show all details for transfers
            if (!filterType) return true;
            if (filterType === 'income') return amt >= 0;
            if (filterType === 'expense') return amt < 0;
            return true;
        };

        if (guideId) {
            details.push(...transactions
                .filter(t => t.guide === guideId && t.date === date)
                .filter(t => matchesFilter(t[amountField]))
                .map(t => ({ date: t.date, description: t.description, amount: t[amountField] }))
            );
        }

        // For scheduled payments, we match by concept or guide name.
        details.push(...scheduledPayments
            .filter(p => p.date === date && ((p.guide && getGuideName(p.guide) === concept) || (!p.guide && p.concept === concept)))
            .map(p => {
                const val = useME ? p.amountME : p.amount;
                return { date: p.date, description: p.concept, amount: val };
            })
            .filter(p => matchesFilter(p.amount))
        );

        if (details.length > 0) {
            setModalTransactions(details);
        }
    };


    const flowData = useMemo(() => {
        const validTransactions = transactions.filter(t => t.date && !isNaN(new Date(t.date).getTime()));
        const validScheduledPayments = scheduledPayments.filter(p => p.date && !isNaN(new Date(p.date).getTime()));

        const initialBalance = validTransactions
            .filter(t => startDateFilter && new Date(t.date) < new Date(startDateFilter))
            .reduce((acc, t) => acc + t[amountField], 0);

        const filterByDate = (item: { date: string }) => {
            const date = new Date(item.date);
            const start = startDateFilter ? new Date(startDateFilter) : null;
            const end = endDateFilter ? new Date(endDateFilter) : null;
            if (start && date < start) return false;
            if (end && date > end) return false;
            return true;
        };

        const filteredTransactions = validTransactions.filter(filterByDate);
        const filteredScheduledPayments = validScheduledPayments.filter(filterByDate);

        const combinedItems: CombinedFlowItem[] = [
            ...filteredTransactions.map(t => ({
                date: t.date,
                concept: getGuideName(t.guide),
                amount: t[amountField],
                type: t.type,
            })),
            ...filteredScheduledPayments.map(p => {
                const rawAmount = useME ? p.amountME : p.amount;
                return {
                    date: p.date,
                    concept: p.guide ? getGuideName(p.guide) : p.concept,
                    amount: rawAmount,
                    type: rawAmount >= 0 ? TransactionType.Income : TransactionType.Expense,
                };
            })
        ];

        if (combinedItems.length === 0) return { dates: [], dataByConcept: new Map(), dailyTotals: new Map(), initialBalance };

        // Sort combined items to determine date range correctly
        const sorted = combinedItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        // Determine date range using UTC to avoid timezone offsets shifts
        const tableStartDate = startDateFilter ? new Date(startDateFilter) : new Date(sorted[0].date);
        
        const lastItemDate = new Date(sorted[sorted.length - 1].date);
        let tableEndDate = endDateFilter ? new Date(endDateFilter) : lastItemDate;
        
        // Ensure we show at least up to today if no end filter is set
        const today = new Date();
        today.setHours(0,0,0,0);
        if (!endDateFilter && lastItemDate < today) {
            tableEndDate = today;
        }
        
        const dates: string[] = [];
        if (!isNaN(tableStartDate.getTime()) && !isNaN(tableEndDate.getTime())) {
            // Normalize start and end to UTC midnight to ensure day-by-day iteration works reliably
            const current = new Date(Date.UTC(tableStartDate.getUTCFullYear(), tableStartDate.getUTCMonth(), tableStartDate.getUTCDate()));
            const end = new Date(Date.UTC(tableEndDate.getUTCFullYear(), tableEndDate.getUTCMonth(), tableEndDate.getUTCDate()));
            
            while (current <= end) {
                dates.push(current.toISOString().split('T')[0]);
                current.setUTCDate(current.getUTCDate() + 1);
            }
        }
        
        // Changed: Value is now an object to separate income/expense/net
        const dataByConcept = new Map<string, { [date: string]: ConceptDailyData }>();
        
        const transferGuideId = '13';
        const transferGuideName = guideMap.get(transferGuideId) || '13-Traspasos intercompañia';

        sorted.forEach(item => {
            if (!dataByConcept.has(item.concept)) {
                dataByConcept.set(item.concept, {});
            }
            const conceptData = dataByConcept.get(item.concept)!;
            
            if (!conceptData[item.date]) {
                conceptData[item.date] = { net: 0, income: 0, expense: 0 };
            }
            
            const entry = conceptData[item.date];
            entry.net += item.amount;
            
            if (item.concept === transferGuideName) {
                // Special handling for Transfers: aggregate EVERYTHING to income (effectively net)
                // This allows displaying the net result (usually 0) in the Income section
                // and prevents it from showing up as a large expense + large income.
                entry.income += item.amount;
                // Expense remains 0 so it won't appear in Egresos
            } else {
                if (item.amount >= 0) {
                    entry.income += item.amount;
                } else {
                    entry.expense += item.amount;
                }
            }
        });

        const dailyTotals = new Map<string, { income: number, expense: number, net: number }>();
        dates.forEach(date => {
            dailyTotals.set(date, { income: 0, expense: 0, net: 0 });
        });

        sorted.forEach(item => {
            if (dailyTotals.has(item.date)) {
                const totals = dailyTotals.get(item.date)!;
                
                if (item.concept === transferGuideName) {
                    // For transfers, add net amount to income total (usually 0)
                    // This prevents inflating the Total Income/Expense lines
                    totals.income += item.amount;
                } else {
                    if (item.amount >= 0) {
                        totals.income += item.amount;
                    } else {
                        totals.expense += item.amount;
                    }
                }
                totals.net += item.amount;
            }
        });

        return { dates, dataByConcept, dailyTotals, initialBalance };
    }, [transactions, scheduledPayments, guides, startDateFilter, endDateFilter, amountField, useME, guideMap]);

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === 0) return '';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };

    const handleExport = () => {
        const headers = ['Concepto / Categoría', ...flowData.dates.map(date => formatDateToDDMMYYYY(date))];
        const rows: (string | number | undefined)[][] = [];
        const transferGuideName = guideMap.get('13') || '13-Traspasos intercompañia';
    
        // Saldo Inicial
        let csvRunningBalance = flowData.initialBalance;
        const initialBalanceRow: (string|number)[] = ['Saldo Inicial Proyectado'];
        flowData.dates.forEach(date => {
            initialBalanceRow.push(csvRunningBalance);
            const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
            csvRunningBalance += dailyNet;
        });
        rows.push(initialBalanceRow);
    
        // Ingresos
        rows.push(['INGRESOS']);
        Array.from(flowData.dataByConcept.entries())
            .sort(sortConceptsByName)
            .filter(([concept, data]) => {
                 if (concept === transferGuideName) return Object.values(data).some((v: ConceptDailyData) => Math.abs(v.income) > 0.01);
                 return Object.values(data).some((v: ConceptDailyData) => v.income > 0);
            })
            .forEach(([concept, data]) => {
                const row: (string|number|undefined)[] = [concept];
                flowData.dates.forEach(date => {
                    const isTransfer = concept === transferGuideName;
                    const val = data[date]?.income;
                    const value = (val !== undefined && (isTransfer ? Math.abs(val) > 0.01 : val > 0)) ? val : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string|number|undefined)[] = ['Total Ingresos'];
        flowData.dates.forEach(date => {
            totalIncomeRow.push(flowData.dailyTotals.get(date)?.income);
        });
        rows.push(totalIncomeRow);
    
        // Egresos
        rows.push(['EGRESOS']);
        Array.from(flowData.dataByConcept.entries())
            .sort(sortConceptsByName)
            .filter(([concept, data]) => {
                // Exclude transfers from expenses section
                if (concept === transferGuideName) return false;
                return Object.values(data).some((v: ConceptDailyData) => v.expense < 0)
            })
            .forEach(([concept, data]) => {
                const row: (string|number|undefined)[] = [concept];
                flowData.dates.forEach(date => {
                    const value = (data[date]?.expense < 0) ? data[date].expense : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string|number|undefined)[] = ['Total Egresos'];
        flowData.dates.forEach(date => {
            totalExpenseRow.push(flowData.dailyTotals.get(date)?.expense);
        });
        rows.push(totalExpenseRow);
    
        // Saldo Final
        let csvFinalBalance = flowData.initialBalance;
        const finalBalanceRow: (string|number)[] = ['Saldo Final Proyectado'];
        flowData.dates.forEach(date => {
            const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
            csvFinalBalance += dailyNet;
            finalBalanceRow.push(csvFinalBalance);
        });
        rows.push(finalBalanceRow);
    
        exportToCsv(`flujo_combinado_${new Date().toISOString().split('T')[0]}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
    };

    let runningBalance = flowData.initialBalance;
    const transferGuideName = guideMap.get('13') || '13-Traspasos intercompañia';

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
                                id="combined-flow-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="combined-flow-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                             <input
                                type="checkbox"
                                id="combined-flow-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="combined-flow-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                            <th className="p-2 text-left font-semibold sticky left-0 bg-primary-600 z-30">Concepto / Categoría</th>
                            {flowData.dates.map(date => <th key={date} className="p-2 text-right font-semibold min-w-[100px]">{formatDateToDDMMYYYY(date)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr className="bg-gray-100 dark:bg-gray-800 font-bold sticky top-9 z-20">
                            <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30">Saldo Inicial Proyectado</td>
                            {flowData.dates.map((date) => {
                                const balanceToShow = runningBalance;
                                const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
                                runningBalance += dailyNet;
                                return <td key={date} className={`p-2 text-right min-w-[100px] ${balanceToShow < 0 ? 'text-red-500': ''}`}>{formatCurrency(balanceToShow)}</td>
                            })}
                        </tr>

                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.dates.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByConcept.entries())
                            .sort(sortConceptsByName)
                            .filter(([concept, data]) => {
                                 if (concept === transferGuideName) {
                                    // Show transfer row if there is any significant net activity (positive or negative)
                                    return Object.values(data).some((v: ConceptDailyData) => Math.abs(v.income) > 0.01);
                                 }
                                 return Object.values(data).some((v: ConceptDailyData) => v.income > 0);
                            })
                            .map(([concept, data]) => (
                            <tr key={concept} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{concept}</td>
                                {flowData.dates.map(date => {
                                    const isTransfer = concept === transferGuideName;
                                    const val = data[date]?.income;
                                    // For transfers, we allow negative 'income' (which represents the net flow) to be displayed
                                    const value = (val !== undefined && (isTransfer ? Math.abs(val) > 0.01 : val > 0)) ? val : undefined;
                                    const colorClass = (value && value < 0) ? 'text-red-600' : 'text-green-600';
                                    return <td key={date} onClick={() => handleCellClick(concept, date, value, 'income')} className={`p-2 text-right min-w-[100px] ${colorClass} cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700`}>{formatCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                         <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.dates.map(date => <td key={date} className="p-2 text-right min-w-[100px] text-green-700">{formatCurrency(flowData.dailyTotals.get(date)?.income)}</td>)}
                        </tr>

                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.dates.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS</td>
                        </tr>
                        {Array.from(flowData.dataByConcept.entries())
                           .sort(sortConceptsByName)
                           .filter(([concept, data]) => {
                               // Explicitly exclude transfers from expenses section
                               if (concept === transferGuideName) return false;
                               return Object.values(data).some((v: ConceptDailyData) => v.expense < 0)
                           })
                           .map(([concept, data]) => (
                            <tr key={concept} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{concept}</td>
                                {flowData.dates.map(date => {
                                    const value = (data[date]?.expense < 0) ? data[date].expense : undefined;
                                    return <td key={date} onClick={() => handleCellClick(concept, date, value, 'expense')} className="p-2 text-right min-w-[100px] text-red-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{formatCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.dates.map(date => <td key={date} className="p-2 text-right min-w-[100px] text-red-700">{formatCurrency(flowData.dailyTotals.get(date)?.expense)}</td>)}
                        </tr>
                        
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Saldo Final Proyectado</td>
                             {(() => {
                                let finalRunningBalance = flowData.initialBalance;
                                return flowData.dates.map(date => {
                                    const dailyNet = flowData.dailyTotals.get(date)?.net || 0;
                                    finalRunningBalance += dailyNet;
                                    return <td key={date} className={`p-2 text-right min-w-[100px] ${finalRunningBalance < 0 ? 'text-red-500' : ''}`}>{formatCurrency(finalRunningBalance)}</td>
                                });
                             })()}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default CombinedFlowView;
