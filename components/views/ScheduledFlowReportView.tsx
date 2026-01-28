import React, { useMemo, useState } from 'react';
import { useAppContext } from '../../contexts/AppContext';
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

const ScheduledFlowReportView: React.FC = () => {
    const { scheduledPayments, guides } = useAppContext();
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [useME, setUseME] = useState(false);
    const [modalTransactions, setModalTransactions] = useState<TransactionDetail[] | null>(null);
    const [isFullDetailView, setIsFullDetailView] = useState(false);

    const amountField = useME ? 'amountME' : 'amount';
    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    
    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
    const guideNameMap = useMemo(() => new Map(guides.map(g => [g.name, g.id])), [guides]);
    const getGuideName = (id: string | undefined) => id ? (guideMap.get(id) || 'Sin Categoría') : 'Sin Categoría';

    const handleCellClick = (guideName: string, weekStartDateStr: string, amount: number | undefined) => {
        if (!amount) return;
        
        const guideId = guideNameMap.get(guideName);
        
        const weekStartDate = new Date(weekStartDateStr + 'T12:00:00Z');
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);

        const details = scheduledPayments
            .filter(p => {
                const pDate = new Date(p.date + 'T12:00:00Z');
                const pGuideName = getGuideName(p.guide);
                return pGuideName === guideName && pDate >= weekStartDate && pDate < weekEndDate;
            })
            .map(p => {
                const val = useME ? p.amountME : p.amount;
                return {
                    date: p.date,
                    description: p.concept,
                    amount: val
                };
            });

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

    const flowData = useMemo(() => {
        const validPayments = scheduledPayments.filter(p => p.date && !isNaN(new Date(p.date).getTime()));
        if (validPayments.length === 0) return { weeks: [], dataByGuide: new Map(), weeklyTotals: new Map() };

        const sorted = [...validPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const selectedWeekStart = selectedDate ? getWeekStartDate(selectedDate) : null;

        const filteredPayments = selectedWeekStart
            ? sorted.filter(p => getWeekStartDate(p.date) === selectedWeekStart)
            : sorted;
        
        if (filteredPayments.length === 0 && !selectedWeekStart) {
             return { weeks: [], dataByGuide: new Map(), weeklyTotals: new Map() };
        }

        let weeks: string[] = [];
        if (selectedWeekStart) {
            weeks.push(selectedWeekStart);
        } else if (sorted.length > 0) {
            const firstWeekStr = getWeekStartDate(sorted[0].date);
            const lastDate = new Date(sorted[sorted.length - 1].date + 'T12:00:00Z');
            for (let d = new Date(firstWeekStr + 'T12:00:00Z'); d <= lastDate; d.setDate(d.getDate() + 7)) {
                weeks.push(d.toISOString().split('T')[0]);
            }
        }
        
        const dataByGuide = new Map<string, { [week: string]: number }>();
        filteredPayments.forEach(p => {
            const week = getWeekStartDate(p.date);
            const guideName = getGuideName(p.guide);
            if (!dataByGuide.has(guideName)) {
                dataByGuide.set(guideName, {});
            }
            const guideData = dataByGuide.get(guideName)!;
            const val = useME ? p.amountME : p.amount;
            guideData[week] = (guideData[week] || 0) + val;
        });

        const weeklyTotals = new Map<string, { income: number, expense: number, net: number }>();
        weeks.forEach(week => {
            weeklyTotals.set(week, { income: 0, expense: 0, net: 0 });
        });

        filteredPayments.forEach(p => {
            const week = getWeekStartDate(p.date);
            const totals = weeklyTotals.get(week);
            const val = useME ? p.amountME : p.amount;
            if (totals) {
                if (val >= 0) {
                    totals.income += val;
                } else {
                    totals.expense += val;
                }
                totals.net += val;
            }
        });

        return { weeks, dataByGuide, weeklyTotals };
    }, [scheduledPayments, guides, selectedDate, amountField, useME]);


    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === 0) return '';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };
    
    const handleExport = () => {
        const headers = ['Categoría', ...flowData.weeks.map(week => formatWeekHeader(week))];
        const rows: (string | number | undefined)[][] = [];

        // Ingresos
        rows.push(['INGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v > 0))
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.weeks.forEach(week => {
                    const value = (typeof data[week] === 'number' && data[week] > 0) ? data[week] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string | number | undefined)[] = ['Total Ingresos'];
        flowData.weeks.forEach(week => {
            totalIncomeRow.push(flowData.weeklyTotals.get(week)?.income);
        });
        rows.push(totalIncomeRow);

        // Egresos
        rows.push(['EGRESOS']);
        Array.from(flowData.dataByGuide.entries())
            .sort(sortGuidesByName)
            .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v < 0))
            .forEach(([guideName, data]) => {
                const row: (string | number | undefined)[] = [guideName];
                flowData.weeks.forEach(week => {
                    const value = (typeof data[week] === 'number' && data[week] < 0) ? data[week] : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string | number | undefined)[] = ['Total Egresos'];
        flowData.weeks.forEach(week => {
            totalExpenseRow.push(flowData.weeklyTotals.get(week)?.expense);
        });
        rows.push(totalExpenseRow);

        // Flujo Neto
        const netFlowRow: (string | number)[] = ['Flujo Neto Semanal'];
        flowData.weeks.forEach(week => {
            const weeklyNet = flowData.weeklyTotals.get(week)?.net || 0;
            netFlowRow.push(weeklyNet);
        });
        rows.push(netFlowRow);

        exportToCsv(`reporte_programado_${new Date().toISOString().split('T')[0]}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
    };


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
                                id="scheduled-report-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="scheduled-report-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="scheduled-report-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="scheduled-report-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                            {flowData.weeks.map(week => <th key={week} className="p-2 text-right font-semibold">{formatWeekHeader(week)}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        
                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.weeks.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS PROGRAMADOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                            .sort(sortGuidesByName)
                            .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v > 0))
                            .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.weeks.map(week => {
                                    const value = typeof data[week] === 'number' && data[week] > 0 ? data[week]: undefined;
                                    return <td key={week} onClick={() => handleCellClick(guideName, week, value)} className="p-2 text-right text-green-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{formatCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                         <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.weeks.map(week => <td key={week} className="p-2 text-right text-green-700">{formatCurrency(flowData.weeklyTotals.get(week)?.income)}</td>)}
                        </tr>


                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.weeks.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS PROGRAMADOS</td>
                        </tr>
                        {Array.from(flowData.dataByGuide.entries())
                           .sort(sortGuidesByName)
                           .filter(([, data]) => Object.values(data).some(v => typeof v === 'number' && v < 0))
                           .map(([guideName, data]) => (
                            <tr key={guideName} className="bg-white dark:bg-gray-800">
                                <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                {flowData.weeks.map(week => {
                                    const value = typeof data[week] === 'number' && data[week] < 0 ? data[week] : undefined
                                    return <td key={week} onClick={() => handleCellClick(guideName, week, value)} className="p-2 text-right text-red-600 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">{formatCurrency(value)}</td>
                                })}
                            </tr>
                        ))}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.weeks.map(week => <td key={week} className="p-2 text-right text-red-700">{formatCurrency(flowData.weeklyTotals.get(week)?.expense)}</td>)}
                        </tr>
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Flujo Neto Semanal</td>
                            {flowData.weeks.map(week => {
                                const net = flowData.weeklyTotals.get(week)?.net || 0;
                                return <td key={week} className={`p-2 text-right ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(net)}</td>
                            })}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default ScheduledFlowReportView;
