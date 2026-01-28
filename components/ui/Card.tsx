
import React, { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-lg shadow-md p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
};

export default Card;
