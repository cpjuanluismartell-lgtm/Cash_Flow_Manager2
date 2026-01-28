import React, { useState } from 'react';
import Card from '../ui/Card';
import Input from '../ui/Input';
import Button from '../ui/Button';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'cf2025') {
      setError('');
      onLoginSuccess();
    } else {
      setError('Contraseña incorrecta. Por favor, intente de nuevo.');
      setPassword('');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary-600 dark:text-primary-400">CashFlow</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manager Pro</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="password"
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button type="submit" className="w-full">
            Acceder
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default LoginScreen;
