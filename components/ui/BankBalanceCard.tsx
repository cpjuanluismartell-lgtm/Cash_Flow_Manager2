import React from 'react';
import { CreditCardStackIcon } from '../icons/IconComponents';

interface BankBalanceCardProps {
    name: string;
    balance: number;
    currency: string;
    locale: string;
}

const BankBalanceCard: React.FC<BankBalanceCardProps> = ({ name, balance, currency, locale }) => {
    
    const formattedAmount = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(balance);

    const balanceColor = balance >= 0 ? 'text-primary-600 dark:text-primary-400' : 'text-red-500';

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 relative min-h-[140px] flex flex-col justify-between">
            <div>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{name}</h3>
                <p className={`text-3xl font-bold mt-2 ${balanceColor}`}>{formattedAmount} <span className="text-2xl">{currency}</span></p>
            </div>
            
            <div className="flex justify-between items-end">
                <div className="absolute -bottom-2 -left-2 bg-amber-500 p-3 rounded-lg shadow-lg text-white">
                    <CreditCardStackIcon className="w-8 h-8" />
                </div>
                <div className="absolute bottom-4 right-4 text-primary-500 font-bold tracking-widest">
                    ...
                </div>
            </div>
        </div>
    );
};

export default BankBalanceCard;
