import React, { useState } from 'react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível entrar agora.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8 bg-white dark:bg-dark-card p-8 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-gold text-dark rounded-full flex items-center justify-center mb-6 shadow-lg shadow-gold/20">
            <span className="text-2xl font-bold tracking-tighter">L</span>
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            LEVEL JJ
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Entre com sua conta real do Firebase
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error ? (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-xl text-sm text-center">
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                E-mail
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-dark text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-colors sm:text-sm"
                placeholder="voce@academia.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-4 py-3 border border-gray-300 dark:border-gray-700 bg-white dark:bg-dark text-gray-900 dark:text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-gold focus:border-transparent transition-colors sm:text-sm"
                placeholder="Sua senha"
                required
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-xl text-dark bg-gold hover:bg-gold-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gold dark:focus:ring-offset-dark transition-all disabled:opacity-70 shadow-lg shadow-gold/20"
            >
              {isLoading ? (
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-dark" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Entrar'}
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
            <p>Use o mesmo usuário cadastrado no Authentication do Firebase.</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
