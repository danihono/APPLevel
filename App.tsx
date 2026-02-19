
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import HomeView from './views/HomeView';
import CalendarView from './views/CalendarView';
import StoreView from './views/StoreView';
import ProfileView from './views/ProfileView';
import ProfessorView from './views/ProfessorView';
import LoginView from './views/LoginView';
import StudentsView from './views/StudentsView';
import { MOCK_USER, MOCK_BRANCHES } from './constants';
import { UserRole } from './types';

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [currentUser, setCurrentUser] = useState(MOCK_USER);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleLogin = (role: UserRole) => {
    setCurrentUser({ ...MOCK_USER, role });
    setIsAuthenticated(true);
  };

  const branch = MOCK_BRANCHES[0];

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  if (!isAuthenticated) {
    return <LoginView onLogin={handleLogin} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <HomeView user={currentUser} branch={branch} />;
      case 'calendar':
        return <CalendarView />;
      case 'training':
        // If teacher, show professor view, else a training log (not implemented yet, fallback to professor for demo)
        return currentUser.role === UserRole.PROFESSOR ? <ProfessorView /> : <ProfessorView />;
      case 'students':
        return <StudentsView />;
      case 'store':
        return <StoreView />;
      case 'profile':
        return <ProfileView user={currentUser} />;
      default:
        return <HomeView user={currentUser} branch={branch} />;
    }
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab}
      isDarkMode={isDarkMode}
      toggleTheme={toggleTheme}
      userRole={currentUser.role}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
