
import React, { useState } from 'react';
import { AppProvider } from './contexts/AppContext';
import { View } from './types';
import Sidebar from './components/layout/Sidebar';
import DashboardView from './components/views/DashboardView';
import TransactionsView from './components/views/TransactionsView';
import DailyFlowView from './components/views/DailyFlowView';
import MonthlyFlowView from './components/views/MonthlyFlowView';
import WeeklyFlowView from './components/views/WeeklyFlowView';
import RealWeeklyFlowView from './components/views/RealWeeklyFlowView';
import CombinedFlowView from './components/views/CombinedFlowView';
import ForecastedMonthlyFlowView from './components/views/ForecastedMonthlyFlowView';
import CatalogsView from './components/views/CatalogsView';
import ScheduledFlowReportView from './components/views/ScheduledFlowReportView';
import { MenuIcon } from './components/icons/IconComponents';
import LoginScreen from './components/auth/LoginScreen';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentView, setCurrentView] = useState<View>(View.Dashboard);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const renderView = () => {
    switch (currentView) {
      case View.Dashboard:
        return <DashboardView />;
      case View.Transactions:
        return <TransactionsView />;
      case View.DailyFlow:
        return <DailyFlowView />;
      case View.MonthlyFlow:
        return <MonthlyFlowView />;
      case View.WeeklyFlow:
        return <WeeklyFlowView />;
      case View.RealWeeklyFlow:
        return <RealWeeklyFlowView />;
      case View.ScheduledFlowReport:
        return <ScheduledFlowReportView />;
      case View.CombinedFlow:
        return <CombinedFlowView />;
      case View.ForecastedMonthlyFlow:
        return <ForecastedMonthlyFlowView />;
      case View.Catalogs:
        return <CatalogsView />;
      default:
        return <DashboardView />;
    }
  };

  const viewTitles: { [key in View]: string } = {
    [View.Dashboard]: "Dashboard",
    [View.Transactions]: "Transacciones",
    [View.DailyFlow]: "Flujo de Efectivo Real (Diario)",
    [View.MonthlyFlow]: "Flujo de Efectivo Real (Mensual)",
    [View.RealWeeklyFlow]: "Flujo de Efectivo Real (Semanal)",
    [View.WeeklyFlow]: "Flujo Semanal Programado",
    [View.ScheduledFlowReport]: "Reporte de Flujo Programado",
    [View.CombinedFlow]: "Flujo Combinado (Real + Programado)",
    [View.ForecastedMonthlyFlow]: "Flujo Mensual Pronóstico",
    [View.Catalogs]: "Catálogos",
  };

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <AppProvider>
      <div className="flex h-screen bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200">
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} isOpen={isSidebarOpen} setOpen={setSidebarOpen} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="flex justify-between items-center p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
              <MenuIcon className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-semibold">{viewTitles[currentView]}</h1>
            <div />
          </header>
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-100 dark:bg-gray-800 p-4 sm:p-6">
            {renderView()}
          </main>
        </div>
      </div>
    </AppProvider>
  );
};

export default App;
