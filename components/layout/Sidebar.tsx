
import React from 'react';
import { View } from '../../types';
import { DashboardIcon, TransactionIcon, CashFlowIcon, CalendarIcon, CatalogIcon, CombinedIcon, XIcon, MonthlyIcon, ForecastIcon } from '../icons/IconComponents';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
}

const NavItem: React.FC<{
  view: View;
  label: string;
  // Fix: The icon is now a component type to allow passing props directly.
  icon: React.ComponentType<{ className?: string }>;
  currentView: View;
  onClick: (view: View) => void;
}> = ({ view, label, icon: Icon, currentView, onClick }) => (
  <li>
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        onClick(view);
      }}
      className={`flex items-center p-2 text-base font-normal rounded-lg transition-colors duration-150 ${
        currentView === view
          ? 'bg-primary-600 text-white'
          : 'text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      <Icon className="w-6 h-6" />
      <span className="ml-3">{label}</span>
    </a>
  </li>
);

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView, isOpen, setOpen }) => {
    
  const handleNavigation = (view: View) => {
      setCurrentView(view);
      if(window.innerWidth < 768) { // md breakpoint
        setOpen(false);
      }
  }

  const navItems = [
    // Fix: Pass icon components instead of elements to resolve typing issue.
    { view: View.Dashboard, label: 'Dashboard', icon: DashboardIcon },
    { view: View.Transactions, label: 'Transacciones', icon: TransactionIcon },
    { view: View.DailyFlow, label: 'Flujo Diario', icon: CashFlowIcon },
    { view: View.MonthlyFlow, label: 'Flujo Mensual', icon: MonthlyIcon },
    { view: View.RealWeeklyFlow, label: 'Flujo Semanal (Real)', icon: CashFlowIcon },
    { view: View.WeeklyFlow, label: 'Flujo Programado', icon: CalendarIcon },
    { view: View.ScheduledFlowReport, label: 'Reporte Programado', icon: CalendarIcon },
    { view: View.CombinedFlow, label: 'Flujo Combinado', icon: CombinedIcon },
    { view: View.ForecastedMonthlyFlow, label: 'Flujo Pronóstico', icon: ForecastIcon },
    { view: View.Catalogs, label: 'Catálogos', icon: CatalogIcon },
  ];

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden ${isOpen ? 'block' : 'hidden'}`} onClick={() => setOpen(false)}></div>
      <aside className={`absolute md:relative z-30 w-64 h-full transition-transform duration-300 ease-in-out bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="h-full px-3 py-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-primary-600 dark:text-primary-400">CashFlow</h2>
            <button onClick={() => setOpen(false)} className="md:hidden p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700">
                <XIcon className="h-6 w-6" />
            </button>
          </div>
          <ul className="space-y-2">
            {navItems.map(item => (
              <NavItem key={item.view} {...item} currentView={currentView} onClick={handleNavigation} />
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
