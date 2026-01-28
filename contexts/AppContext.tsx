import React, { createContext, useContext, useState, ReactNode } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { Bank, Guide, DebitCard, Transaction, ScheduledPayment, CatalogType } from '../types';
import { INITIAL_BANKS, INITIAL_GUIDES, INITIAL_DEBIT_CARDS } from '../constants';

interface AppContextType {
  banks: Bank[];
  addBank: (name: string) => void;
  deleteCatalogItem: (type: CatalogType, id: string) => void;
  guides: Guide[];
  addGuide: (name: string) => void;
  debitCards: DebitCard[];
  addDebitCard: (cardNumber: string, assignedTo: string) => void;
  transactions: Transaction[];
  addTransaction: (transaction: Omit<Transaction, 'id'>) => void;
  addMultipleTransactions: (transactions: Omit<Transaction, 'id'>[]) => void;
  deleteTransaction: (id: string) => void;
  updateTransaction: (id: string, updatedData: Partial<Transaction>) => void;
  clearHistory: () => void;
  scheduledPayments: ScheduledPayment[];
  addScheduledPayment: (payment: Omit<ScheduledPayment, 'id'>) => void;
  addMultipleScheduledPayments: (payments: Omit<ScheduledPayment, 'id'>[]) => void;
  deleteScheduledPayment: (id: string) => void;
  updateScheduledPayment: (id: string, updatedData: Partial<ScheduledPayment>) => void;
  persistenceEnabled: boolean;
  setPersistenceEnabled: (enabled: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [banks, setBanks] = useLocalStorage<Bank[]>('banks', INITIAL_BANKS);
  const [guides, setGuides] = useLocalStorage<Guide[]>('guides', INITIAL_GUIDES);
  const [debitCards, setDebitCards] = useLocalStorage<DebitCard[]>('debitCards', INITIAL_DEBIT_CARDS);
  
  const [persistenceEnabled, setPersistenceEnabled] = useLocalStorage('persistenceEnabled', false);
  const [persistentTransactions, setPersistentTransactions] = useLocalStorage<Transaction[]>('transactions_persistent', []);
  const [sessionTransactions, setSessionTransactions] = useState<Transaction[]>([]);

  const transactions = persistenceEnabled ? persistentTransactions : sessionTransactions;
  const currentSetTransactions = persistenceEnabled ? setPersistentTransactions : setSessionTransactions;

  const [scheduledPayments, setScheduledPayments] = useState<ScheduledPayment[]>([]);

  const addBank = (name: string) => {
    setBanks(prev => [...prev, { id: Date.now().toString(), name }]);
  };

  const addGuide = (name: string) => {
    setGuides(prev => [...prev, { id: Date.now().toString(), name }]);
  };
  
  const addDebitCard = (cardNumber: string, assignedTo: string) => {
    setDebitCards(prev => [...prev, { id: Date.now().toString(), cardNumber, assignedTo }]);
  };

  const deleteCatalogItem = (type: CatalogType, id: string) => {
    switch(type) {
      case 'banks':
        setBanks(prev => prev.filter(item => item.id !== id));
        break;
      case 'guides':
        setGuides(prev => prev.filter(item => item.id !== id));
        break;
      case 'debitCards':
        setDebitCards(prev => prev.filter(item => item.id !== id));
        break;
    }
  }

  const addTransaction = (transaction: Omit<Transaction, 'id'>) => {
    currentSetTransactions(prev => [...prev, { ...transaction, id: Date.now().toString() }]);
  };
  
  const addMultipleTransactions = (newTransactions: Omit<Transaction, 'id'>[]) => {
    const transactionsWithIds = newTransactions.map((t, i) => ({ ...t, id: `${Date.now()}-${i}`}));
    currentSetTransactions(prev => [...prev, ...transactionsWithIds]);
  };
  
  const deleteTransaction = (id: string) => {
    currentSetTransactions(prev => prev.filter(t => t.id !== id));
  };
  
  const updateTransaction = (id: string, updatedData: Partial<Transaction>) => {
    currentSetTransactions(prev => 
      prev.map(t => t.id === id ? { ...t, ...updatedData } : t)
    );
  };

  const clearHistory = () => {
    setPersistentTransactions([]);
    setSessionTransactions([]);
    setScheduledPayments([]);
  };

  const addScheduledPayment = (payment: Omit<ScheduledPayment, 'id'>) => {
    setScheduledPayments(prev => [...prev, { ...payment, id: Date.now().toString() }]);
  };

  const addMultipleScheduledPayments = (newPayments: Omit<ScheduledPayment, 'id'>[]) => {
    const paymentsWithIds = newPayments.map((p, i) => ({ ...p, id: `${Date.now()}-${i}`}));
    setScheduledPayments(prev => [...prev, ...paymentsWithIds]);
  };

  const deleteScheduledPayment = (id: string) => {
    setScheduledPayments(prev => prev.filter(p => p.id !== id));
  };
  
  const updateScheduledPayment = (id: string, updatedData: Partial<ScheduledPayment>) => {
    setScheduledPayments(prev => prev.map(p => p.id === id ? { ...p, ...updatedData } : p));
  };


  const value = {
    banks, addBank, deleteCatalogItem,
    guides, addGuide,
    debitCards, addDebitCard,
    transactions, addTransaction, addMultipleTransactions, deleteTransaction, updateTransaction, clearHistory,
    scheduledPayments, addScheduledPayment, addMultipleScheduledPayments, deleteScheduledPayment, updateScheduledPayment,
    persistenceEnabled, setPersistenceEnabled
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};