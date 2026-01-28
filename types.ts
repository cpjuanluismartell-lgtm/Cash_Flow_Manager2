
// Fix: Removed self-import of 'Bank' which was causing a name collision.
export interface Bank {
  id: string;
  name: string;
}

export interface Guide {
  id: string;
  name: string;
  // Fix: Added optional property 'isInactiveForForecast' to support forecasting logic.
  isInactiveForForecast?: boolean;
}

export interface DebitCard {
  id: string;
  cardNumber: string;
  assignedTo: string;
}

export enum TransactionType {
  Income = 1,
  Expense = 2,
}

export interface Transaction {
  id: string;
  bank: string; // Bank ID
  guide: string; // Guide ID
  month: string; // e.g., "2023-10"
  date: string; // e.g., "2023-10-26"
  description: string;
  amountMN: number;
  amountME: number;
  type: TransactionType;
  assigned: string; // DebitCard ID or person name
}

export interface ScheduledPayment {
  id: string;
  responsible: string;
  supplier: string;
  concept: string;
  amountME: number;
  exchangeRate: number;
  amount: number;
  guide?: string; // Guide ID
  date: string; // e.g., "2023-10-26"
}

export enum View {
  Dashboard = 'DASHBOARD',
  Transactions = 'TRANSACTIONS',
  DailyFlow = 'DAILY_FLOW',
  MonthlyFlow = 'MONTHLY_FLOW',
  WeeklyFlow = 'WEEKLY_FLOW',
  RealWeeklyFlow = 'REAL_WEEKLY_FLOW',
  ScheduledFlowReport = 'SCHEDULED_FLOW_REPORT',
  CombinedFlow = 'COMBINED_FLOW',
  ForecastedMonthlyFlow = 'FORECASTED_MONTHLY_FLOW',
  Catalogs = 'CATALOGS',
}

export type CatalogType = 'banks' | 'guides' | 'debitCards';
