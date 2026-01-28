import React, { useMemo, useState, useCallback } from 'react';
import { useAppContext } from '../../contexts/AppContext';
import { TransactionType, Guide } from '../../types';
import Card from '../ui/Card';
import { formatDateToMonthYear } from '../../utils/formatters';
import { exportToCsv } from '../../utils/csvExport';
import Button from '../ui/Button';
import TransactionTooltip from '../ui/TransactionTooltip';
import VatDetailModal from '../ui/VatDetailModal';


interface TransactionDetail {
  date: string;
  description: string;
  amount: number;
}

export interface VatDetailData {
  incomes: { name: string; amount: number }[];
  expenses: { name: string; amount: number }[];
  totalIncome: number;
  totalExpense: number;
  ivaCobrado: number;
  ivaAcreditable: number;
  netVat: number;
}


const ForecastedMonthlyFlowView: React.FC = () => {
    const { transactions, guides } = useAppContext();
    const [useME, setUseME] = useState(false);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [excludedGuideIds, setExcludedGuideIds] = useState<Set<string>>(new Set());
    const [modalTransactions, setModalTransactions] = useState<TransactionDetail[] | null>(null);
    const [isFullDetailView, setIsFullDetailView] = useState(false);
    
    const [vatDetailData, setVatDetailData] = useState<VatDetailData | null>(null);
    const [selectedVatMonth, setSelectedVatMonth] = useState<string | null>(null);


    const amountField = useME ? 'amountME' : 'amountMN';
    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    
    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g])), [guides]);
    const getGuide = useCallback((id: string) => guideMap.get(id), [guideMap]);

    const handleCellClick = (guideId: string, month: string, isForecast: boolean | undefined, amount: number | undefined) => {
        if (!amount || isForecast) return;

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
    
    const handleVatCellClick = (month: string) => {
        const details = flowData.vatDetailsByMonth.get(month);
        if (details) {
            setVatDetailData(details);
            setSelectedVatMonth(month);
        }
    };


    const handleToggleExclusion = (guideId: string) => {
        setExcludedGuideIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(guideId)) {
                newSet.delete(guideId);
            } else {
                newSet.add(guideId);
            }
            return newSet;
        });
    };

    const flowData = useMemo(() => {
        const activeGuides = guides.filter(g => !g.isInactiveForForecast && !excludedGuideIds.has(g.id));
        const activeGuideIds = new Set(activeGuides.map(g => g.id));
        
        const initialBalanceGuideId = guides.find(g => g.name === '0-Saldo Inicial')?.id;
        const aguinaldoGuideId = guides.find(g => g.name === '20-Aguinaldo')?.id;
        const nominaGuideId = guides.find(g => g.name === '19-Nómina')?.id;
        const ptuGuideId = guides.find(g => g.name === '22-PTU Garantizada')?.id;

        const vatGuideId = guides.find(g => g.name.startsWith('29-'))?.id;
        const operatingIncomeGuideIds = new Set(guides.filter(g => /\bP\d{4}\b/.test(g.name)).map(g => g.id));
        const excludedExpenseNamesForVat = new Set([
            '19-Nómina', '20-Aguinaldo', '22-PTU Garantizada', '25-Nómina generico', '23-Finiquitos',
            '26-IMSS, RCV e INFONAVIT', '27-Impuesto Sobre Remuneraciones', '28-ISR Personas Morales', '30-ISR Retenido',
            '31-IVA Retenido', '32-Otros impuestos federales', '59-American Express Company mexic',
            '65-ISR por pagar', '66-IVA por pagar', '67-Retenidos por pagar',
            '68-IMSS, RCV e INFONAVIT por pagar', '69-Impuesto Sobre Remuneraciones por pagar',
            '70-Otros impuestos por pagar', '71-AMEXCO PYPSA Cta. 51003',
            '72-Carbures Europe, S.A (Suc)', '74-Fonacot', '75-Gratificacion Garantizada',
            '76-Gratificacion FA', '80-Otros Acreedores por Pagar'
        ]);
        const excludedExpenseIdsForVat = new Set(guides.filter(g => excludedExpenseNamesForVat.has(g.name)).map(g => g.id));

        const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const lastRealDate = sortedTransactions.length > 0 ? new Date(sortedTransactions[0].date + 'T12:00:00Z') : new Date(0);
        
        const baseMonthlyAverages = new Map<string, number>();
        const historyStartDate = new Date(lastRealDate);
        historyStartDate.setMonth(historyStartDate.getMonth() - 3);

        const historicalTransactions = transactions.filter(t => {
            if (!t.guide || !activeGuideIds.has(t.guide) || t.guide === initialBalanceGuideId) return false;
            const tDate = new Date(t.date + 'T12:00:00Z');
            return tDate >= historyStartDate && tDate <= lastRealDate;
        });
        
        if (historicalTransactions.length > 0) {
            const sumsByGuide = new Map<string, number>();
            const monthsInHistory = new Set<string>();

            historicalTransactions.forEach(t => {
                sumsByGuide.set(t.guide, (sumsByGuide.get(t.guide) || 0) + t[amountField]);
                monthsInHistory.add(t.date.substring(0, 7));
            });
            
            const monthCount = monthsInHistory.size > 0 ? monthsInHistory.size : 1;

            sumsByGuide.forEach((totalAmount, guideId) => {
                baseMonthlyAverages.set(guideId, totalAmount / monthCount);
            });
        }
        
        const isFutureYear = selectedYear > lastRealDate.getFullYear();
        let monthlyAverages = baseMonthlyAverages;

        if (isFutureYear) {
            const previousYear = selectedYear - 1;
            const previousYearTotals = new Map<string, number>();
            const prevYearMonths = Array.from({ length: 12 }, (_, i) => `${previousYear}-${(i + 1).toString().padStart(2, '0')}`);

            prevYearMonths.forEach(month => {
                const monthStartDate = new Date(month + '-01T12:00:00Z');
                const isPrevYearMonthForecast = monthStartDate > lastRealDate;

                if (isPrevYearMonthForecast) {
                    baseMonthlyAverages.forEach((avg, guideId) => {
                         if (!activeGuideIds.has(guideId) || guideId === initialBalanceGuideId) return;
                         const isDecember = month.endsWith('-12');
                         if (guideId === aguinaldoGuideId) {
                             if (isDecember && nominaGuideId) {
                                 const nominaAvg = baseMonthlyAverages.get(nominaGuideId) || 0;
                                 previousYearTotals.set(guideId, (previousYearTotals.get(guideId) || 0) - (Math.abs(nominaAvg) / 2));
                             }
                         } else {
                             previousYearTotals.set(guideId, (previousYearTotals.get(guideId) || 0) + avg);
                         }
                    });
                } else {
                    transactions.filter(t => t.date.substring(0, 7) === month && activeGuideIds.has(t.guide) && t.guide !== initialBalanceGuideId)
                        .forEach(t => {
                            if(t.guide) {
                                previousYearTotals.set(t.guide, (previousYearTotals.get(t.guide) || 0) + t[amountField]);
                            }
                        });
                }
            });

            const adjustedMonthlyAverages = new Map<string, number>();
            baseMonthlyAverages.forEach((avg, guideId) => {
                const projectedTotal = avg * 12;
                const previousTotal = previousYearTotals.get(guideId) || 0;

                if (Math.abs(projectedTotal) > Math.abs(previousTotal) && previousTotal !== 0) {
                     adjustedMonthlyAverages.set(guideId, previousTotal / 12);
                } else {
                     adjustedMonthlyAverages.set(guideId, avg);
                }
            });
            monthlyAverages = adjustedMonthlyAverages;
        }

        const months = Array.from({ length: 12 }, (_, i) => `${selectedYear}-${(i + 1).toString().padStart(2, '0')}`);
        const dataByGuide = new Map<string, { [month: string]: { amount: number, isForecast: boolean } }>();
        const monthlyTotals = new Map<string, { income: number, expense: number, net: number, isForecast: boolean }>();
        const vatDetailsByMonth = new Map<string, VatDetailData>();
        
        const forecastCorrection = new Map<string, number>();


        months.forEach(month => {
            const monthStartDate = new Date(month + '-01T12:00:00Z');
            const isForecast = monthStartDate > lastRealDate;
            monthlyTotals.set(month, { income: 0, expense: 0, net: 0, isForecast });

            if (!isForecast) {
                transactions.filter(t => t.date.substring(0, 7) === month).forEach(t => {
                    if (!t.guide) return;
                    const guideId = t.guide;
                    if (!dataByGuide.has(guideId)) dataByGuide.set(guideId, {});
                    const guideData = dataByGuide.get(guideId)!;
                    if (!guideData[month]) guideData[month] = { amount: 0, isForecast: false };
                    guideData[month].amount += t[amountField];
                });
            } else {
                // First, forecast all guides EXCEPT VAT
                activeGuides.forEach(guide => {
                    if (guide.id === vatGuideId) return; // Skip VAT for now
                    
                    let amount = 0;
                    const isDecember = month.endsWith('-12');
                    const isMay = month.endsWith('-05');

                    if (guide.id === aguinaldoGuideId) {
                        if (isDecember && nominaGuideId) {
                            const nominaAvg = monthlyAverages.get(nominaGuideId) || 0;
                            amount = -(Math.abs(nominaAvg) / 2);
                        }
                    } else if (guide.id === ptuGuideId) {
                        if (isMay && nominaGuideId) {
                            const nominaAvg = monthlyAverages.get(nominaGuideId) || 0;
                            amount = -(Math.abs(nominaAvg) / 2);
                        }
                    } else {
                        const originalAmount = monthlyAverages.get(guide.id) || 0;
                        if (Math.abs(originalAmount) < 0.01) {
                            amount = 0;
                        } else {
                             // Use last month of the year as the correction point.
                            const isLastForecastMonth = month === months[months.length - 1];

                            if (!isLastForecastMonth) {
                                // Introduce a variation, e.g., +/- 20%
                                const variation = (Math.random() - 0.5) * 0.4;
                                const variedAmount = originalAmount * (1 + variation);
                                const error = variedAmount - originalAmount;
                                
                                forecastCorrection.set(guide.id, (forecastCorrection.get(guide.id) || 0) + error);
                                amount = variedAmount;
                            } else {
                                // In the last month, apply the correction to maintain the annual total
                                const correction = forecastCorrection.get(guide.id) || 0;
                                amount = originalAmount - correction;
                                forecastCorrection.delete(guide.id); // Clean up
                            }
                        }
                    }
                    
                    if (Math.abs(amount) > 0.01) {
                         const guideId = guide.id;
                         if (!dataByGuide.has(guideId)) dataByGuide.set(guideId, {});
                         const guideData = dataByGuide.get(guideId)!;
                         guideData[month] = { amount: amount, isForecast: true };
                    }
                });

                // Now, calculate VAT based on the forecasts we just made for this month
                if (vatGuideId && activeGuideIds.has(vatGuideId)) {
                    const vatDetail: VatDetailData = {
                        incomes: [],
                        expenses: [],
                        totalIncome: 0,
                        totalExpense: 0,
                        ivaCobrado: 0,
                        ivaAcreditable: 0,
                        netVat: 0,
                    };

                    dataByGuide.forEach((monthData, guideId) => {
                        const forecastForMonth = monthData[month];
                        if (forecastForMonth && forecastForMonth.isForecast) {
                            const amount = forecastForMonth.amount;
                            const guideName = getGuide(guideId)?.name || 'Unknown';
                            if (operatingIncomeGuideIds.has(guideId)) {
                                vatDetail.incomes.push({ name: guideName, amount });
                                vatDetail.totalIncome += amount;
                            } else if (amount < 0 && !excludedExpenseIdsForVat.has(guideId)) {
                                vatDetail.expenses.push({ name: guideName, amount });
                                vatDetail.totalExpense += amount;
                            }
                        }
                    });
                    
                    vatDetail.ivaCobrado = (vatDetail.totalIncome / 1.16) * 0.16;
                    vatDetail.ivaAcreditable = (Math.abs(vatDetail.totalExpense) / 1.16) * 0.16;
                    const netVatToPay = vatDetail.ivaCobrado - vatDetail.ivaAcreditable;
                    vatDetail.netVat = -netVatToPay;
                    
                    if (Math.abs(vatDetail.netVat) > 0.01) {
                        if (!dataByGuide.has(vatGuideId)) dataByGuide.set(vatGuideId, {});
                        const guideData = dataByGuide.get(vatGuideId)!;
                        guideData[month] = { amount: vatDetail.netVat, isForecast: true };
                        vatDetailsByMonth.set(month, vatDetail);
                    }
                }
            }
        });
        
        dataByGuide.forEach((guideData) => {
            Object.entries(guideData).forEach(([month, data]) => {
                const totals = monthlyTotals.get(month);
                if (totals) {
                    if (data.amount > 0) totals.income += data.amount;
                    else totals.expense += data.amount;
                    totals.net += data.amount;
                }
            });
        });
        
        const initialBalance = transactions
            .filter(t => new Date(t.date).getFullYear() < selectedYear)
            .reduce((acc, t) => acc + t[amountField], 0);

        return { months, dataByGuide, monthlyTotals, initialBalance, vatDetailsByMonth };
    }, [transactions, guides, selectedYear, amountField, excludedGuideIds, getGuide]);

    const formatCurrency = (value: number | undefined) => {
        if (value === undefined || value === 0) return '';
        return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
    };

    const handleExport = () => {
        const headers = ['Categoría', ...flowData.months.map(month => `${formatDateToMonthYear(month)} ${flowData.monthlyTotals.get(month)?.isForecast ? '(P)' : ''}`)];
        const rows: (string | number | undefined)[][] = [];

        let csvRunningBalance = flowData.initialBalance;
        const initialBalanceRow: (string | number)[] = ['Saldo Inicial'];
        flowData.months.forEach(month => {
            initialBalanceRow.push(csvRunningBalance);
            csvRunningBalance += flowData.monthlyTotals.get(month)?.net || 0;
        });
        rows.push(initialBalanceRow);

        rows.push(['INGRESOS']);
        sortedIncomeGuides
            .forEach(([guideId, data]) => {
                const guideName = getGuide(guideId)?.name || 'N/A';
                const row: (string | number | undefined)[] = [guideName];
                flowData.months.forEach(month => {
                    const value = (data[month]?.amount > 0) ? data[month].amount : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalIncomeRow: (string | number | undefined)[] = ['Total Ingresos'];
        flowData.months.forEach(month => totalIncomeRow.push(flowData.monthlyTotals.get(month)?.income));
        rows.push(totalIncomeRow);

        rows.push(['EGRESOS']);
        sortedExpenseGuides
            .forEach(([guideId, data]) => {
                const guideName = getGuide(guideId)?.name || 'N/A';
                const row: (string | number | undefined)[] = [guideName];
                flowData.months.forEach(month => {
                    const value = (data[month]?.amount < 0) ? data[month].amount : undefined;
                    row.push(value);
                });
                rows.push(row);
            });
        const totalExpenseRow: (string | number | undefined)[] = ['Total Egresos'];
        flowData.months.forEach(month => totalExpenseRow.push(flowData.monthlyTotals.get(month)?.expense));
        rows.push(totalExpenseRow);

        let csvFinalBalance = flowData.initialBalance;
        const finalBalanceRow: (string | number)[] = ['Saldo Final'];
        flowData.months.forEach(month => {
            csvFinalBalance += flowData.monthlyTotals.get(month)?.net || 0;
            finalBalanceRow.push(csvFinalBalance);
        });
        rows.push(finalBalanceRow);

        exportToCsv(`flujo_pronostico_${selectedYear}.csv`, headers, rows.map(r => r.map(c => c === undefined ? '' : c)));
    };

    let runningBalance = flowData.initialBalance;
    
    const sortGuidesById = useCallback((a: [string, any], b: [string, any]): number => {
        const nameA = getGuide(a[0])?.name || '';
        const nameB = getGuide(b[0])?.name || '';
        
        const getNum = (name: string) => {
            const match = name.match(/^(\d+)-/);
            return match ? parseInt(match[1], 10) : Infinity;
        };

        const numA = getNum(nameA);
        const numB = getNum(nameB);

        if (numA !== Infinity && numB !== Infinity) {
            if (numA !== numB) return numA - numB;
        }
        if (numA !== Infinity && numB === Infinity) return -1;
        if (numA === Infinity && numB !== Infinity) return 1;
        
        return nameA.localeCompare(nameB);
    }, [getGuide]);
    
    const sortedIncomeGuides = useMemo(() => {
        return Array.from(flowData.dataByGuide.entries())
            .filter(([, monthData]) => Object.values(monthData).some((d: { amount: number; isForecast: boolean }) => d.amount > 0))
            .sort(sortGuidesById);
    }, [flowData.dataByGuide, sortGuidesById]);

    const sortedExpenseGuides = useMemo(() => {
        return Array.from(flowData.dataByGuide.entries())
            .filter(([, monthData]) => Object.values(monthData).some((d: { amount: number; isForecast: boolean }) => d.amount < 0))
            .sort(sortGuidesById);
    }, [flowData.dataByGuide, sortGuidesById]);


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
            <VatDetailModal
                isOpen={!!vatDetailData}
                onClose={() => setVatDetailData(null)}
                data={vatDetailData}
                month={selectedVatMonth}
                formatCurrency={formatCurrency}
            />
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
                                id="forecast-flow-full-detail-toggle"
                                checked={isFullDetailView}
                                onChange={(e) => setIsFullDetailView(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="forecast-flow-full-detail-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                                Vista detalle completa
                            </label>
                        </div>
                        <div className="flex items-center">
                            <input
                                type="checkbox"
                                id="forecast-flow-me-toggle"
                                checked={useME}
                                onChange={(e) => setUseME(e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:bg-gray-700 dark:border-gray-600"
                            />
                            <label htmlFor="forecast-flow-me-toggle" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
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
                            {flowData.months.map(month => {
                                const isForecast = flowData.monthlyTotals.get(month)?.isForecast;
                                return (
                                    <th key={month} className={`p-2 text-right font-semibold ${isForecast ? 'bg-primary-700' : ''}`}>
                                        {formatDateToMonthYear(month)}
                                        {isForecast && <span className="text-xs font-normal opacity-80 ml-1">(P)</span>}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr className="bg-gray-100 dark:bg-gray-800 font-bold sticky top-9 z-20">
                            <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-800 z-30">Saldo Inicial</td>
                            {flowData.months.map(month => {
                                const balanceToShow = runningBalance;
                                runningBalance += flowData.monthlyTotals.get(month)?.net || 0;
                                return <td key={month} className="p-2 text-right">{formatCurrency(balanceToShow)}</td>;
                            })}
                        </tr>

                        <tr className="bg-green-50 dark:bg-green-900/50 font-semibold">
                            <td colSpan={flowData.months.length + 1} className="p-2 sticky left-0 bg-green-50 dark:bg-green-900/50 z-10">INGRESOS</td>
                        </tr>
                        {sortedIncomeGuides.map(([guideId, monthData]) => {
                            const isExcluded = excludedGuideIds.has(guideId);
                            const guideName = getGuide(guideId)?.name || 'N/A';
                            if (guideName === '0-Saldo Inicial') {
                                return (
                                     <tr key={guideId} className="bg-white dark:bg-gray-800">
                                        <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10">{guideName}</td>
                                        {flowData.months.map(month => {
                                             const data = monthData[month];
                                             const value = (data && data.amount > 0) ? data.amount : undefined;
                                             return <td key={month} className="p-2 text-right text-green-600">{formatCurrency(value)}</td>
                                        })}
                                    </tr>
                                );
                            };
                            return (
                                <tr key={guideId} className={`bg-white dark:bg-gray-800 ${isExcluded ? 'opacity-40' : ''}`}>
                                    <td className="p-2 flex items-center sticky left-0 bg-white dark:bg-gray-800 z-10">
                                        <input
                                            type="checkbox"
                                            checked={!isExcluded}
                                            onChange={() => handleToggleExclusion(guideId)}
                                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-3 flex-shrink-0"
                                            title="Incluir/Excluir del pronóstico"
                                        />
                                        <span className={isExcluded ? 'line-through' : ''}>{guideName}</span>
                                    </td>
                                    {flowData.months.map(month => {
                                        const data = monthData[month];
                                        const value = (data && data.amount > 0) ? data.amount : undefined;
                                        const isForecast = data?.isForecast;
                                        return <td key={month} onClick={(e) => handleCellClick(guideId, month, isForecast, value)} className={`p-2 text-right text-green-600 ${isForecast ? 'italic' : ''} ${!isForecast && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'}`}>{formatCurrency(value)}</td>;
                                    })}
                                </tr>
                            );
                        })}
                        <tr className="bg-green-100 dark:bg-green-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-green-100 dark:bg-green-800/60 z-10">Total Ingresos</td>
                            {flowData.months.map(month => <td key={month} className="p-2 text-right text-green-700">{formatCurrency(flowData.monthlyTotals.get(month)?.income)}</td>)}
                        </tr>

                        <tr className="bg-red-50 dark:bg-red-900/50 font-semibold">
                            <td colSpan={flowData.months.length + 1} className="p-2 sticky left-0 bg-red-50 dark:bg-red-900/50 z-10">EGRESOS</td>
                        </tr>
                         {sortedExpenseGuides.map(([guideId, monthData]) => {
                            const isExcluded = excludedGuideIds.has(guideId);
                            const guide = getGuide(guideId);
                            const guideName = guide?.name || 'N/A';
                            const isVatGuide = guideName.startsWith('29-');
                            return (
                                 <tr key={guideId} className={`bg-white dark:bg-gray-800 ${isExcluded ? 'opacity-40' : ''}`}>
                                    <td className="p-2 flex items-center sticky left-0 bg-white dark:bg-gray-800 z-10">
                                         <input
                                            type="checkbox"
                                            checked={!isExcluded}
                                            onChange={() => handleToggleExclusion(guideId)}
                                            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 mr-3 flex-shrink-0"
                                            title="Incluir/Excluir del pronóstico"
                                        />
                                        <span className={isExcluded ? 'line-through' : ''}>{guideName}</span>
                                    </td>
                                    {flowData.months.map(month => {
                                        const data = monthData[month];
                                        const value = (data && data.amount < 0) ? data.amount : undefined;
                                        const isForecast = data?.isForecast;
                                        
                                        let onClickHandler: (() => void) | undefined = undefined;
                                        let cursorClass = '';

                                        if (isVatGuide && isForecast && value !== undefined) {
                                            onClickHandler = () => handleVatCellClick(month);
                                            cursorClass = 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700';
                                        } else if (!isForecast && value !== undefined) {
                                            onClickHandler = () => handleCellClick(guideId, month, isForecast, value);
                                            cursorClass = 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700';
                                        }
                                        
                                        return <td key={month} onClick={onClickHandler} className={`p-2 text-right text-red-600 ${isForecast ? 'italic' : ''} ${cursorClass}`}>{formatCurrency(value)}</td>;
                                    })}
                                </tr>
                            );
                        })}
                        <tr className="bg-red-100 dark:bg-red-800/60 font-bold">
                            <td className="p-2 sticky left-0 bg-red-100 dark:bg-red-800/60 z-10">Total Egresos</td>
                            {flowData.months.map(month => <td key={month} className="p-2 text-right text-red-700">{formatCurrency(flowData.monthlyTotals.get(month)?.expense)}</td>)}
                        </tr>
                        <tr className="bg-gray-200 dark:bg-gray-700 font-bold">
                            <td className="p-2 sticky left-0 bg-gray-200 dark:bg-gray-700 z-10">Saldo Final</td>
                            {(() => {
                                let finalRunningBalance = flowData.initialBalance;
                                return flowData.months.map(month => {
                                    finalRunningBalance += flowData.monthlyTotals.get(month)?.net || 0;
                                    return <td key={month} className="p-2 text-right">{formatCurrency(finalRunningBalance)}</td>
                                });
                            })()}
                        </tr>
                    </tbody>
                </table>
            </Card>
        </div>
    );
};

export default ForecastedMonthlyFlowView;
