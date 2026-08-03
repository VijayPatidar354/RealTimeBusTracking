import React from 'react';

const HomeLayout = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚌</span>
              <span className="font-bold text-xl text-gray-800">
                Track The Bus 
              </span>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex flex-col">
        {children}
      </main>

      <footer className="bg-white border-t py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          © {new Date().getFullYear()} Real-Time Bus Tracking System. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default HomeLayout;