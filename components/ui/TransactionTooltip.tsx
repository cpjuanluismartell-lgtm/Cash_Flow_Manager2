import React from 'react';
import { formatDateToDDMMYYYY } from '../../utils/formatters';
import Modal from './Modal';

interface TransactionDetail {
  date: string;
  description: string;
  amount: number;
}

interface TooltipProps {
  isOpen: boolean;
  transactions: TransactionDetail[];
  onClose: () => void;
  currency: 'MXN' | 'USD';
  locale: 'es-MX' | 'en-US';
  isFullDetail?: boolean;
}

const TransactionTooltip: React.FC<TooltipProps> = ({ isOpen, transactions, onClose, currency, locale, isFullDetail = false }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currency }).format(value);
  };

  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalle de Transacciones"
      maxWidth="5xl" // Keep modal wide for full detail view
    >
      <div className="overflow-x-auto">
        {transactions.length > 0 ? (
          // Use `w-auto` and `mx-auto` to allow the table to shrink and center itself
          // instead of stretching full-width. This brings columns closer.
          <table className="w-auto mx-auto text-sm">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
              <tr>
                <th className="p-2 text-left font-semibold">Fecha</th>
                {/* Constrain the description column width */}
                <th className="p-2 text-left font-semibold max-w-2xl">Descripción</th>
                <th className="p-2 text-right font-semibold">Importe</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => (
                <tr key={i} className="border-t dark:border-gray-700">
                  <td className="p-2 whitespace-nowrap align-top">{formatDateToDDMMYYYY(t.date)}</td>
                  <td 
                    // `max-w-2xl` constrains width. `truncate` is used when not in full detail view.
                    className={`p-2 align-top max-w-2xl ${!isFullDetail ? 'truncate' : 'whitespace-normal break-words'}`} 
                    title={!isFullDetail ? t.description : undefined}
                  >
                    {t.description}
                  </td>
                  <td className={`p-2 text-right font-mono whitespace-nowrap align-top ${t.amount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatCurrency(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-100 dark:bg-gray-800 font-bold">
              <tr className="border-t-2 border-gray-300 dark:border-gray-600">
                <td colSpan={2} className="p-2 text-right">Total:</td>
                <td className={`p-2 text-right font-mono ${totalAmount < 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {formatCurrency(totalAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-center text-gray-500 py-4">No hay detalles disponibles.</p>
        )}
      </div>
    </Modal>
  );
};

export default TransactionTooltip;