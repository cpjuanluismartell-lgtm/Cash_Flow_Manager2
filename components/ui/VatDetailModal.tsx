import React from 'react';
import Modal from './Modal';
import { formatDateToMonthYear } from '../../utils/formatters';
import { VatDetailData } from '../views/ForecastedMonthlyFlowView';


interface VatDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: VatDetailData | null;
  month: string | null;
  formatCurrency: (value: number) => string;
}

const VatDetailModal: React.FC<VatDetailModalProps> = ({ isOpen, onClose, data, month, formatCurrency }) => {
  if (!isOpen || !data || !month) return null;
  
  const formattedMonth = formatDateToMonthYear(month);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Detalle del Cálculo de IVA - ${formattedMonth}`} maxWidth="4xl">
      <div className="space-y-6">
        {/* IVA Cobrado Section */}
        <div>
          <h4 className="text-lg font-semibold text-green-600 mb-2">Cálculo de IVA Cobrado (Ingresos)</h4>
          <div className="overflow-hidden border rounded-lg dark:border-gray-700">
            <table className="min-w-full divide-y dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Concepto de Ingreso</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto Pronosticado</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y dark:divide-gray-700">
                {data.incomes.map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                 {data.incomes.length === 0 && (
                    <tr><td colSpan={2} className="text-center py-4 text-sm text-gray-500">No hay ingresos gravables pronosticados para este mes.</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold">
                <tr>
                  <td className="px-4 py-2 text-left text-sm">Total Ingresos Gravables</td>
                  <td className="px-4 py-2 text-right text-sm font-mono">{formatCurrency(data.totalIncome)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-left text-sm">IVA Cobrado (16%)</td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-green-600">{formatCurrency(data.ivaCobrado)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* IVA Acreditable Section */}
        <div>
          <h4 className="text-lg font-semibold text-red-600 mb-2">Cálculo de IVA Acreditable (Egresos)</h4>
           <div className="overflow-hidden border rounded-lg dark:border-gray-700">
            <table className="min-w-full divide-y dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Concepto de Egreso</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Monto Pronosticado</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y dark:divide-gray-700">
                {data.expenses.map((item, index) => (
                  <tr key={index}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">{item.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-mono">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                {data.expenses.length === 0 && (
                    <tr><td colSpan={2} className="text-center py-4 text-sm text-gray-500">No hay egresos acreditables pronosticados para este mes.</td></tr>
                )}
              </tbody>
              <tfoot className="bg-gray-100 dark:bg-gray-700 font-bold">
                 <tr>
                  <td className="px-4 py-2 text-left text-sm">Total Egresos Acreditables</td>
                  <td className="px-4 py-2 text-right text-sm font-mono">{formatCurrency(data.totalExpense)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-left text-sm">IVA Acreditable (16%)</td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-red-600">{formatCurrency(data.ivaAcreditable)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Determination Section */}
        <div>
          <h4 className="text-lg font-semibold text-primary-600 mb-2">Determinación de IVA por Pagar</h4>
          <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border dark:border-gray-700">
            <div className="flex justify-between items-center py-1">
              <span className="text-sm">IVA Cobrado</span>
              <span className="text-sm font-mono text-green-600">{formatCurrency(data.ivaCobrado)}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b dark:border-gray-600">
              <span className="text-sm">(-) IVA Acreditable</span>
              <span className="text-sm font-mono text-red-600">{formatCurrency(data.ivaAcreditable)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 font-bold">
              <span className="text-md">(=) IVA a Pagar (Gasto)</span>
              <span className="text-md font-mono text-primary-600">{formatCurrency(-data.netVat)}</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default VatDetailModal;