import { useState } from 'react';
import Navbar from '../components/navbar/Navbar.jsx';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import { useDarkMode } from '../hooks/useDarkMode.js';

function DashboardLayout({ children, title, subtitle, navItems, headerActions }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useDarkMode();

  return (
    <div className="dashboard-shell flex">
      <Sidebar
        title={title}
        subtitle={subtitle}
        items={navItems}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar
          title={title}
          onMenuClick={() => setIsSidebarOpen(true)}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((value) => !value)}
          actions={headerActions}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl animate-fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default DashboardLayout;
