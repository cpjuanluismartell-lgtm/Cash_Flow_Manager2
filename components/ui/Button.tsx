import React from 'react';

// Define the props for the button. It extends all standard HTML button attributes.
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const Button: React.FC<ButtonProps> = (props) => {
  const { 
    children,
    variant = 'primary',
    size = 'md',
    className,
    ...restOfProps // The rest of the props, including onClick, disabled, etc.
  } = props;

  // Define base styles for the button
  const baseStyles = 'inline-flex items-center font-bold rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed';

  // Define styles for different variants (colors)
  const variantStyles = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  };

  // Define styles for different sizes
  const sizeStyles = {
    sm: 'py-1 px-2 text-sm',
    md: 'py-2 px-4 text-base',
    lg: 'py-3 px-6 text-lg',
  };

  // Combine classes, making sure to handle undefined className
  const finalClassName = [
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    className,
  ].filter(Boolean).join(' ');

  // Return the native button, spreading the REST of the props
  // This ensures onClick, disabled, type, etc. are passed through.
  return (
    <button className={finalClassName} {...restOfProps}>
      {children}
    </button>
  );
};

export default Button;