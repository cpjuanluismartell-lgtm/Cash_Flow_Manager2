import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useAppContext } from '../../contexts/AppContext';
import Card from '../ui/Card';
import { TransactionType } from '../../types';
import Button from '../ui/Button';
import { InfoIcon, DownloadIcon } from '../icons/IconComponents';
import BankBalanceCard from '../ui/BankBalanceCard';
import { exportToCsv } from '../../utils/csvExport';
import { formatDateToDDMMYYYY } from '../../utils/formatters';

// Helper to define activity types based on guide IDs
const getActivityType = (guideId: string): 'Operating' | 'Investing' | 'Financing' => {
  const id = parseInt(guideId, 10);
  if (isNaN(id)) return 'Operating';

  // Investing activities
  if ((id >= 16 && id <= 18) || id === 62) {
    // 16-Otros Productos Financieros, 17-Inversiones, 18-Venta de Activos, 62-Activo fijo
    return 'Investing';
  }
  // Financing activities
  if ((id >= 13 && id <= 15) || id === 58) {
    // 13-Traspasos intercompañia, 14-Prestamos, 15-Airtificial Aportación, 58-amortizacion de prestamos
    return 'Financing';
  }
  // Operating activities (default for all others)
  return 'Operating';
};

const getPeriodDates = (year: number, periodType: 'year' | 'semester' | 'quarter' | 'month', period: number): { startDate: Date, endDate: Date } => {
    let startDate, endDate;
    switch (periodType) {
        case 'month':
            startDate = new Date(year, period - 1, 1);
            endDate = new Date(year, period, 0);
            break;
        case 'quarter':
            startDate = new Date(year, (period - 1) * 3, 1);
            endDate = new Date(year, period * 3, 0);
            break;
        case 'semester':
            startDate = new Date(year, (period - 1) * 6, 1);
            endDate = new Date(year, period * 6, 0);
            break;
        case 'year':
        default:
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
            break;
    }
    return { startDate, endDate };
};

const ActivityDonutChart: React.FC<{
  name: string;
  value: number;
  percentage: number;
  color: string;
  formatCurrency: (value: number) => string;
  tooltipText?: string;
}> = ({ name, value, percentage, color, formatCurrency, tooltipText }) => {
  
  const chartData = [
    { name: 'value', value: percentage },
    { name: 'remaining', value: 100 - percentage > 0 ? 100 - percentage : 0 },
  ];

  return (
    <div className="flex items-center justify-between relative group">
      <div className="text-left">
        <p className={`text-xl font-bold ${value < 0 ? 'text-red-500' : 'text-cyan-500'}`}>{formatCurrency(value)}</p>
        <p className="text-md font-semibold">{percentage.toFixed(2)}%</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{name}</p>
      </div>
      <div style={{ width: 70, height: 70 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="80%"
              dataKey="value"
              startAngle={90}
              endAngle={-270}
              cornerRadius={10}
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill="rgba(2, 132, 199, 0.1)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      {tooltipText && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
              <p className="font-bold">{name}:</p>
              <p>{tooltipText}</p>
          </div>
      )}
    </div>
  );
};


const DashboardView: React.FC = () => {
    const { transactions, scheduledPayments, guides, banks } = useAppContext();
    const [useME, setUseME] = useState(false);
    const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
    const [periodType, setPeriodType] = useState<'year' | 'semester' | 'quarter' | 'month'>('year');
    const [selectedPeriod, setSelectedPeriod] = useState<number>(0); // 0 for year, 1-2 for semester, 1-4 for quarter, 1-12 for month

    const transactionsWithoutTransfers = useMemo(() => {
        const transferGuideId = '13'; 
        return transactions.filter(t => t.guide !== transferGuideId);
    }, [transactions]);

    const currency = useME ? 'USD' : 'MXN';
    const locale = useME ? 'en-US' : 'es-MX';
    const amountField = useME ? 'amountME' : 'amountMN';

    const formatCurrency = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(value);
    const formatCurrencyDetailed = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    const guideMap = useMemo(() => new Map(guides.map(g => [g.id, g.name])), [guides]);
    const bankMap = useMemo(() => new Map(banks.map(b => [b.id, b.name])), [banks]);


    const dataForPeriod = useMemo(() => {
        const period = periodType === 'year' ? 0 : selectedPeriod;
        if (period === 0 && periodType !== 'year') {
             const allForYear = transactionsWithoutTransfers.filter(t => new Date(t.date).getFullYear() === selectedYear);
             const balanceBeforeYear = transactionsWithoutTransfers
                .filter(t => new Date(t.date).getFullYear() < selectedYear)
                .reduce((sum, t) => sum + t[amountField], 0);
             return { periodTransactions: allForYear, initialBalance: balanceBeforeYear };
        }

        const { startDate, endDate } = getPeriodDates(selectedYear, periodType, period);
        
        const periodTransactions = transactionsWithoutTransfers.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= startDate && tDate <= endDate;
        });

        const initialBalance = transactionsWithoutTransfers
            .filter(t => new Date(t.date) < startDate)
            .reduce((sum, t) => sum + t[amountField], 0);

        return { periodTransactions, initialBalance };

    }, [transactionsWithoutTransfers, selectedYear, periodType, selectedPeriod, amountField]);


    const kpiData = useMemo(() => {
        const { periodTransactions, initialBalance } = dataForPeriod;

        const income = periodTransactions.filter(t => t.type === TransactionType.Income).reduce((sum, t) => sum + t[amountField], 0);
        const expenses = periodTransactions.filter(t => t.type === TransactionType.Expense).reduce((sum, t) => sum + Math.abs(t[amountField]), 0);
        
        const operatingFlow = periodTransactions
            .filter(t => getActivityType(t.guide) === 'Operating')
            .reduce((sum, t) => sum + t[amountField], 0);

        const accountsPayable = scheduledPayments
            .filter(p => new Date(p.date) > new Date() && p.amount < 0) // only future payments and only expenses (negative)
            .reduce((sum, p) => sum + Math.abs(p.amount), 0);
        
        const finalBalance = initialBalance + income - expenses;
        const cashRatio = expenses > 0 ? income / expenses : 0;

        return { income, expenses, operatingFlow, accountsPayable, finalBalance, cashRatio };
    }, [dataForPeriod, scheduledPayments, amountField]);

    const guideCategorization = useMemo(() => {
        const investingGuides = guides
            .filter(g => getActivityType(g.id) === 'Investing')
            .map(g => g.name.replace(/^\d+-/, '').trim());
        const financingGuides = guides
            .filter(g => getActivityType(g.id) === 'Financing')
            .map(g => g.name.replace(/^\d+-/, '').trim());

        return {
            Inversiones: `Suma de categorías: ${investingGuides.join(', ')}.`,
            Financiamiento: `Suma de categorías: ${financingGuides.join(', ')}.`,
            Operaciones: 'Suma de todas las demás categorías que no son de inversión o financiamiento.'
        };
    }, [guides]);


     const activityBreakdown = useMemo(() => {
        const { periodTransactions } = dataForPeriod;
        const activities = {
            Operating: 0,
            Investing: 0,
            Financing: 0,
        };
        periodTransactions.forEach(t => {
            const type = getActivityType(t.guide);
            activities[type] += t[amountField];
        });

        const totalAbsActivity = Math.abs(activities.Operating) + Math.abs(activities.Investing) + Math.abs(activities.Financing);

        return [
            { name: 'Operaciones', value: activities.Operating },
            { name: 'Inversiones', value: activities.Investing },
            { name: 'Financiamiento', value: activities.Financing },
        ].map(activity => ({
            name: activity.name,
            value: activity.value,
            percentage: totalAbsActivity > 0 ? (Math.abs(activity.value) / totalAbsActivity) * 100 : 0,
            color: '#0369a1' // primary-700
        }));
    }, [dataForPeriod, amountField]);

    const topCategories = useMemo(() => {
        const incomeMap = new Map<string, number>();
        const expenseMap = new Map<string, number>();
        
        dataForPeriod.periodTransactions.forEach(t => {
            const guideName = guides.find(g => g.id === t.guide)?.name || 'Sin Categoría';
            if(t.type === TransactionType.Income) {
                incomeMap.set(guideName, (incomeMap.get(guideName) || 0) + t[amountField]);
            } else {
                expenseMap.set(guideName, (expenseMap.get(guideName) || 0) + Math.abs(t[amountField]));
            }
        });

        const topIncomes = [...incomeMap.entries()].sort((a,b) => b[1] - a[1]).slice(0,5).map(([name, value]) => ({name, value}));
        const topExpenses = [...expenseMap.entries()].sort((a,b) => b[1] - a[1]).slice(0,5).map(([name, value]) => ({name, value}));

        return { topIncomes, topExpenses };

    }, [dataForPeriod, guides, amountField]);

    const bankBalancesData = useMemo(() => {
        const period = periodType === 'year' ? 0 : selectedPeriod;
        
        let lastDayOfPeriod;
        if (period === 0) {
            lastDayOfPeriod = getPeriodDates(selectedYear, 'year', 1).endDate;
        } else {
            lastDayOfPeriod = getPeriodDates(selectedYear, periodType, period).endDate;
        }

        const relevantTransactions = transactions.filter(t => new Date(t.date) <= lastDayOfPeriod);

        const balances = new Map<string, number>();
        relevantTransactions.forEach(t => {
            balances.set(t.bank, (balances.get(t.bank) || 0) + t[amountField]);
        });
    
        const bankMap = new Map(banks.map(b => [b.id, b.name]));
    
        return Array.from(balances.entries())
            .map(([bankId, balance]) => ({
                name: bankMap.get(bankId) || 'Desconocido',
                balance: balance,
            }))
            .filter(item => Math.abs(item.balance) > 0.01)
            .sort((a, b) => b.balance - a.balance);
    
    }, [transactions, banks, amountField, selectedYear, periodType, selectedPeriod]);

    const monthlyChartData = useMemo(() => {
        const { periodTransactions, initialBalance } = dataForPeriod;
        
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        const allMonthsData = Array.from({ length: 12 }, (_, i) => ({
            name: new Date(selectedYear, i, 1).toLocaleString('es-ES', { month: 'short' }),
            ingresos: null as number | null,
            egresos: null as number | null,
            ingresosProyectados: null as number | null,
            egresosProyectados: null as number | null,
            saldoReal: null as number | null,
            saldoProyectado: null as number | null,
        }));

        let lastRealMonthIndex = -1;

        // Populate with actual transactions
        periodTransactions.forEach(t => {
            const transactionDate = new Date(t.date + 'T12:00:00Z');
            if (transactionDate.getFullYear() === selectedYear) {
                const monthIndex = transactionDate.getMonth();
                
                // If viewing the current year, only process transactions up to and including the current month.
                // Future months will be projected.
                if (selectedYear === currentYear) {
                     if (monthIndex > currentMonth) return;
                }

                lastRealMonthIndex = Math.max(lastRealMonthIndex, monthIndex);
                if (allMonthsData[monthIndex].ingresos === null) allMonthsData[monthIndex].ingresos = 0;
                if (allMonthsData[monthIndex].egresos === null) allMonthsData[monthIndex].egresos = 0;

                if (t.type === TransactionType.Income) {
                    allMonthsData[monthIndex].ingresos! += t[amountField];
                } else {
                    allMonthsData[monthIndex].egresos! += Math.abs(t[amountField]);
                }
            }
        });

        // Forecast future months if there is historical data in the current year
        if (lastRealMonthIndex > -1 && lastRealMonthIndex < 11) {
            const forecastBaseStartIndex = Math.max(0, lastRealMonthIndex - 2); // 3-month window
            let totalIncomeForAvg = 0;
            let totalExpenseForAvg = 0;
            let monthCountForAvg = 0;

            for (let i = forecastBaseStartIndex; i <= lastRealMonthIndex; i++) {
                if (allMonthsData[i].ingresos !== null) {
                    totalIncomeForAvg += allMonthsData[i].ingresos || 0;
                    totalExpenseForAvg += allMonthsData[i].egresos || 0;
                    monthCountForAvg++;
                }
            }

            const avgIncome = monthCountForAvg > 0 ? totalIncomeForAvg / monthCountForAvg : 0;
            const avgExpense = monthCountForAvg > 0 ? totalExpenseForAvg / monthCountForAvg : 0;

            // Set the connection point for the forecast line
            allMonthsData[lastRealMonthIndex].ingresosProyectados = allMonthsData[lastRealMonthIndex].ingresos;
            allMonthsData[lastRealMonthIndex].egresosProyectados = allMonthsData[lastRealMonthIndex].egresos;

            // Populate forecast data for subsequent months (including current month if skipped above)
            for (let i = lastRealMonthIndex + 1; i < 12; i++) {
                allMonthsData[i].ingresosProyectados = avgIncome;
                allMonthsData[i].egresosProyectados = avgExpense;
            }
        }

        // Calculate running balance for both real and projected data
        let runningBalance = initialBalance;
        allMonthsData.forEach((monthData, index) => {
            const isRealMonth = monthData.ingresos !== null || monthData.egresos !== null;
            
            const income = isRealMonth ? monthData.ingresos : monthData.ingresosProyectados;
            const expense = isRealMonth ? monthData.egresos : monthData.egresosProyectados;
            
            const netChange = (income || 0) - (expense || 0);
            runningBalance += netChange;

            if (isRealMonth) {
                monthData.saldoReal = runningBalance;
            } else {
                monthData.saldoProyectado = runningBalance;
            }
        });

        // Set connection point for the balance forecast line
        if (lastRealMonthIndex > -1 && lastRealMonthIndex < 11) {
            allMonthsData[lastRealMonthIndex].saldoProyectado = allMonthsData[lastRealMonthIndex].saldoReal;
        }

        return allMonthsData;
    }, [dataForPeriod, selectedYear, amountField]);
    
    const financialSummary = useMemo(() => {
        const summary = Array.from({ length: 12 }, (_, i) => {
            const date = new Date(selectedYear, i, 1);
            const monthName = date.toLocaleString(locale, { month: 'long' }); 
            return {
                monthIndex: i,
                monthName: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                income: 0,
                expense: 0,
            };
        });

        const transferGuideId = '13';

        transactions.forEach(t => {
            if (t.date && new Date(t.date).getFullYear() === selectedYear) {
                const monthIndex = parseInt(t.date.substring(5, 7), 10) - 1;
                
                if (monthIndex >= 0 && monthIndex < 12) {
                    if (t.guide === transferGuideId) {
                        summary[monthIndex].income += t[amountField];
                    } else {
                        if (t.type === TransactionType.Income) {
                            summary[monthIndex].income += t[amountField];
                        } else {
                            summary[monthIndex].expense += Math.abs(t[amountField]);
                        }
                    }
                }
            }
        });

        const totalIncome = summary.reduce((acc, curr) => acc + curr.income, 0);
        const totalExpense = summary.reduce((acc, curr) => acc + curr.expense, 0);
        const totalProfit = totalIncome - totalExpense;
        const totalMargin = totalIncome > 0 ? (totalProfit / totalIncome) * 100 : 0;
        
        const initialBalance = transactions
            .filter(t => t.date && new Date(t.date).getFullYear() < selectedYear)
            .reduce((acc, t) => acc + t[amountField], 0);

        const finalBalance = initialBalance + totalProfit;

        const maxProfit = Math.max(...summary.map(s => Math.abs(s.income - s.expense)), 1);

        return {
            monthlyData: summary.map(m => {
                const profit = m.income - m.expense;
                const margin = m.income > 0 ? (profit / m.income) * 100 : 0;
                return { ...m, profit, margin, maxProfit };
            }),
            totals: {
                income: totalIncome,
                expense: totalExpense,
                profit: totalProfit,
                margin: totalMargin,
                initialBalance,
                finalBalance,
            }
        };
    }, [transactions, selectedYear, amountField, locale]);

    const periodButtons = {
        month: Array.from({ length: 12 }, (_, i) => ({ label: new Date(0, i).toLocaleString('es-ES', { month: 'short' }), period: i + 1 })),
        quarter: [{ label: 'T1', period: 1 }, { label: 'T2', period: 2 }, { label: 'T3', period: 3 }, { label: 'T4', period: 4 }],
        semester: [{ label: 'Sem 1', period: 1 }, { label: 'Sem 2', period: 2 }],
        year: [],
    };

    const maxIncome = useMemo(() => Math.max(...topCategories.topIncomes.map(i => i.value), 0), [topCategories.topIncomes]);
    const maxExpense = useMemo(() => Math.max(...topCategories.topExpenses.map(e => e.value), 0), [topCategories.topExpenses]);

    const handleExportActivityDetails = (activityName: 'Operaciones' | 'Inversiones' | 'Financiamiento') => {
        const activityMap = {
            'Operaciones': 'Operating',
            'Inversiones': 'Investing',
            'Financiamiento': 'Financing',
        };
        const englishActivityName = activityMap[activityName];

        const transactionsToExport = dataForPeriod.periodTransactions.filter(t => 
            getActivityType(t.guide) === englishActivityName
        );

        if (transactionsToExport.length === 0) {
            alert(`No hay transacciones para exportar en la categoría "${activityName}".`);
            return;
        }

        const headers = ['Fecha', 'Banco', 'Categoría', 'Descripción', `Importe (${currency})`];
        const rows = transactionsToExport.map(t => [
            formatDateToDDMMYYYY(t.date),
            bankMap.get(t.bank) || 'N/A',
            guideMap.get(t.guide) || 'N/A',
            t.description,
            t[amountField]
        ]);

        const filename = `detalle_${activityName.toLowerCase().replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        exportToCsv(filename, headers, rows);
    };


    return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                    <Button onClick={() => setSelectedYear(y => y - 1)} size="sm" variant="secondary">{'<'}</Button>
                    <span className="font-semibold text-lg w-20 text-center">{selectedYear}</span>
                    <Button onClick={() => setSelectedYear(y => y + 1)} size="sm" variant="secondary">{'>'}</Button>
                </div>
                 <div className="flex items-center rounded-lg p-1 bg-gray-200 dark:bg-gray-700">
                    {(Object.keys(periodButtons) as ('year' | 'semester' | 'quarter' | 'month')[]).map(pt => (
                        <Button key={pt} onClick={() => { setPeriodType(pt); setSelectedPeriod(0); }} variant={periodType === pt ? 'primary' : 'secondary'} size="sm" className={periodType !== pt ? 'bg-transparent border-transparent shadow-none dark:bg-transparent' : ''}>
                           {pt === 'year' ? 'Año' : pt.charAt(0).toUpperCase() + pt.slice(1)}
                        </Button>
                    ))}
                </div>
                 <div className="flex items-center space-x-2">
                    <input type="checkbox" id="db-me-toggle" checked={useME} onChange={e => setUseME(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"/>
                    <label htmlFor="db-me-toggle" className="text-sm font-medium">Ver en ME</label>
                </div>
            </div>
             {periodType !== 'year' && (
                <div className="flex flex-wrap items-center gap-2 border-t dark:border-gray-700 pt-4">
                    <Button onClick={() => setSelectedPeriod(0)} variant={selectedPeriod === 0 ? 'primary' : 'secondary'} size="sm">Todo</Button>
                    {periodButtons[periodType].map(p => (
                        <Button key={p.label} onClick={() => setSelectedPeriod(p.period)} variant={selectedPeriod === p.period ? 'primary' : 'secondary'} size="sm">{p.label}</Button>
                    ))}
                </div>
            )}
        </div>
      </Card>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <Card>
            <div className="flex items-center justify-center space-x-2 relative group">
                <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Operativo</p>
                <InfoIcon className="w-4 h-4 text-gray-400" />
                <div className="absolute bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
                    Mide la rentabilidad de las operaciones principales del negocio. Un valor positivo es una buena señal.
                </div>
            </div>
            <p className="text-xl font-bold">{formatCurrency(kpiData.operatingFlow)}</p>
        </Card>
        <Card>
            <div className="flex items-center justify-center space-x-2 relative group">
                <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Neto (Bancos)</p>
                <InfoIcon className="w-4 h-4 text-gray-400" />
                <div className="absolute bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
                    Suma total de efectivo en todas las cuentas. Es el principal indicador de liquidez.
                </div>
            </div>
            <p className="text-xl font-bold">{formatCurrency(kpiData.finalBalance)}</p>
        </Card>
        <Card>
            <div className="flex items-center justify-center space-x-2 relative group">
                <p className="text-sm text-gray-500 dark:text-gray-400">Cuentas por Pagar</p>
                <InfoIcon className="w-4 h-4 text-gray-400" />
                <div className="absolute bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
                    Suma de los pagos programados a futuro. Representa las obligaciones de pago pendientes.
                </div>
            </div>
            <p className="text-xl font-bold">{formatCurrency(kpiData.accountsPayable)}</p>
        </Card>
        <Card>
            <div className="flex items-center justify-center space-x-2 relative group">
                <p className="text-sm text-gray-500 dark:text-gray-400">Ratio de Efectivo</p>
                <InfoIcon className="w-4 h-4 text-gray-400" />
                <div className="absolute bottom-full mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
                    Compara ingresos contra egresos (Ingresos / Egresos). Un valor mayor a 1 indica que los ingresos cubren los gastos.
                </div>
            </div>
            <p className="text-xl font-bold">{kpiData.cashRatio.toFixed(2)}</p>
        </Card>
      </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
             <Card className="flex-grow flex flex-col justify-center items-center text-center bg-primary-50 dark:bg-primary-900/20">
                <p className="text-lg text-gray-600 dark:text-gray-300">Efectivo al Final del Periodo</p>
                <p className="text-5xl font-extrabold text-primary-600 dark:text-primary-400 my-4">{formatCurrency(kpiData.finalBalance)}</p>
             </Card>
             <Card className="flex-grow">
                 <div className="flex items-center justify-center space-x-2 relative group mb-4">
                    <h3 className="text-lg font-semibold text-center">Desglose por Actividad</h3>
                    <InfoIcon className="w-5 h-5 text-gray-400" />
                    <div className="absolute bottom-full mb-2 w-72 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-10 text-left shadow-lg">
                        <p className="font-bold">Operación:</p><p className="mb-1">Actividades principales del negocio.</p>
                        <p className="font-bold">Inversión:</p><p className="mb-1">Compra/venta de activos a largo plazo.</p>
                        <p className="font-bold">Financiamiento:</p><p>Actividades de deuda, capital y préstamos.</p>
                    </div>
                </div>
                 <div className="flex flex-col space-y-2">
                    {activityBreakdown.map(activity => (
                        <div key={activity.name} className="flex items-center gap-2">
                            <div className="flex-grow">
                                <ActivityDonutChart 
                                    name={activity.name}
                                    value={activity.value}
                                    percentage={activity.percentage}
                                    color={activity.color}
                                    formatCurrency={formatCurrency}
                                    tooltipText={guideCategorization[activity.name as keyof typeof guideCategorization]}
                                />
                            </div>
                            <Button 
                                variant="secondary" 
                                size="sm"
                                className="p-2"
                                onClick={() => handleExportActivityDetails(activity.name as 'Operaciones' | 'Inversiones' | 'Financiamiento')}
                                title={`Exportar detalle de ${activity.name}`}
                            >
                                <DownloadIcon className="w-5 h-5" />
                            </Button>
                        </div>
                    ))}
                    
                    {/* Added Saldo Inicial Row */}
                    <div className="flex items-center gap-2 pt-4 mt-2 border-t border-dashed border-gray-300 dark:border-gray-600">
                        <div className="flex-grow flex items-center justify-between">
                            <div className="text-left">
                                <p className={`text-xl font-bold ${dataForPeriod.initialBalance < 0 ? 'text-red-500' : 'text-cyan-500'}`}>
                                    {formatCurrency(dataForPeriod.initialBalance)}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Saldo Inicial</p>
                            </div>
                            {/* Visual alignment spacer to match donut column width (approx 70px) */}
                             <div style={{ width: 70 }} className="flex justify-center items-center">
                                <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                             </div>
                        </div>
                        {/* Visual alignment spacer for button column (approx 36px) */}
                        <div className="w-[38px]"></div>
                    </div>
                </div>
             </Card>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <Card>
                <h3 className="text-lg font-semibold mb-4">Tendencia de Ingresos y Egresos</h3>
                <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128, 128, 128, 0.2)" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(val) => `${val/1000}k`} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Legend />
                        <Line type="monotone" dataKey="ingresos" stroke="#10b981" name="Ingresos" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                        <Line type="monotone" dataKey="egresos" stroke="#ef4444" name="Egresos" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                        <Line type="monotone" dataKey="ingresosProyectados" stroke="#10b981" name="Ingresos (Proy.)" strokeDasharray="5 5" connectNulls strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                        <Line type="monotone" dataKey="egresosProyectados" stroke="#ef4444" name="Egresos (Proy.)" strokeDasharray="5 5" connectNulls strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                    </LineChart>
                </ResponsiveContainer>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="text-lg font-semibold mb-4">Principales Ingresos</h3>
                    {topCategories.topIncomes.length > 0 ? (
                        <div className="space-y-4">
                            {topCategories.topIncomes.map((item, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-center text-sm mb-1">
                                        <span className="truncate pr-2" title={item.name}>{item.name}</span>
                                        <span className="font-semibold flex-shrink-0">{formatCurrency(item.value)}</span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                        <div
                                            className="bg-green-500 h-2 rounded-full"
                                            style={{ width: `${maxIncome > 0 ? (item.value / maxIncome) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-10">No hay datos de ingresos.</p>
                    )}
                </Card>
                <Card>
                     <h3 className="text-lg font-semibold mb-4">Principales Egresos</h3>
                     {topCategories.topExpenses.length > 0 ? (
                        <div className="space-y-4">
                            {topCategories.topExpenses.map((item, index) => (
                                <div key={index}>
                                    <div className="flex justify-between items-center text-sm mb-1">
                                        <span className="truncate pr-2" title={item.name}>{item.name}</span>
                                        <span className="font-semibold flex-shrink-0">{formatCurrency(item.value)}</span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                        <div
                                            className="bg-red-500 h-2 rounded-full"
                                            style={{ width: `${maxExpense > 0 ? (item.value / maxExpense) * 100 : 0}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-gray-500 text-center py-10">No hay datos de egresos.</p>
                    )}
                </Card>
            </div>
          </div>
       </div>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Tendencia de Saldo Mensual durante el Periodo</h3>
         <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128, 128, 128, 0.2)" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="saldoReal" stroke="#3b82f6" name="Saldo Final Mensual" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
                <Line type="monotone" dataKey="saldoProyectado" stroke="#3b82f6" name="Saldo Final (Proy.)" strokeDasharray="5 5" connectNulls strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}/>
            </LineChart>
         </ResponsiveContainer>
      </Card>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Saldos por Cuenta</h3>
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={bankBalancesData} margin={{ top: 5, right: 20, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" interval={0} />
                <YAxis tickFormatter={(val) => `${val/1000000}M`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend verticalAlign="top" />
                <Bar dataKey="balance" fill="#0284c7" name={`Saldo en ${currency}`} />
            </BarChart>
        </ResponsiveContainer>
      </Card>

      <div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4">Saldos por Cuenta (Detalle)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {bankBalancesData.map((bank) => (
              <BankBalanceCard 
                  key={bank.name}
                  name={bank.name}
                  balance={bank.balance}
                  currency={currency}
                  locale={locale}
              />
          ))}
          {bankBalancesData.length === 0 && <p className="text-gray-500">No hay datos de saldos bancarios para mostrar.</p>}
        </div>
      </div>

      <Card>
        <h3 className="text-lg font-semibold mb-4">Resumen Financiero Anual</h3>
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                    <tr>
                        <th className="px-4 py-3">Año</th>
                        <th className="px-4 py-3">Mes</th>
                        <th className="px-4 py-3 text-right">Total Ingresos</th>
                        <th className="px-4 py-3 text-right">Total Gastos</th>
                        <th className="px-4 py-3 text-right">Total Beneficio</th>
                        <th className="px-4 py-3 text-right">% Margen</th>
                    </tr>
                </thead>
                <tbody>
                    {financialSummary.monthlyData.map((row) => (
                        <tr key={row.monthIndex} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                            <td className="px-4 py-3 font-medium">{selectedYear}</td>
                            <td className="px-4 py-3 font-medium">{row.monthName}</td>
                            <td className="px-4 py-3 text-right">{formatCurrencyDetailed(row.income)}</td>
                            <td className="px-4 py-3 text-right">{formatCurrencyDetailed(row.expense)}</td>
                            <td className="px-4 py-3 text-right">
                                 <div className="flex justify-end w-full items-center">
                                    <div className={`relative flex-1 h-6 rounded flex items-center justify-end px-2 min-w-[100px] max-w-[150px] overflow-hidden ${row.profit >= 0 ? 'bg-green-100 dark:bg-green-900/40' : 'bg-red-100 dark:bg-red-900/40'}`}>
                                        <div 
                                            className={`absolute top-0 right-0 bottom-0 opacity-20 ${row.profit >= 0 ? 'bg-green-500' : 'bg-red-500'}`} 
                                            style={{ width: `${Math.min(Math.abs(row.profit) / row.maxProfit * 100, 100)}%` }} 
                                        />
                                        <span className={`relative z-10 font-bold ${row.profit >= 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                            {formatCurrencyDetailed(row.profit)}
                                        </span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                    <span className={`font-semibold ${row.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>{row.margin.toFixed(2)}%</span>
                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${row.margin >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
                <tfoot className="font-bold">
                    <tr className="bg-gray-100 dark:bg-gray-700">
                        <td className="px-4 py-3" colSpan={2}>Total Anual</td>
                        <td className="px-4 py-3 text-right">{formatCurrencyDetailed(financialSummary.totals.income)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrencyDetailed(financialSummary.totals.expense)}</td>
                        <td className="px-4 py-3 text-right text-green-600">{formatCurrencyDetailed(financialSummary.totals.profit)}</td>
                        <td className="px-4 py-3 text-right">{financialSummary.totals.margin.toFixed(2)}%</td>
                    </tr>
                    <tr className="bg-gray-200 dark:bg-gray-800 border-t-2 border-gray-300 dark:border-gray-600">
                         <td className="px-4 py-3" colSpan={4}>Saldo inicial</td>
                         <td className="px-4 py-3 text-right font-semibold">
                             {formatCurrencyDetailed(financialSummary.totals.initialBalance)}
                         </td>
                         <td className="px-4 py-3"></td>
                    </tr>
                    <tr className="bg-gray-200 dark:bg-gray-800">
                         <td className="px-4 py-3" colSpan={4}>Saldo final</td>
                         <td className="px-4 py-3 text-right font-extrabold text-primary-600 dark:text-primary-400">
                             {formatCurrencyDetailed(financialSummary.totals.finalBalance)}
                         </td>
                         <td className="px-4 py-3"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
      </Card>
    </div>
  );
};

export default DashboardView;