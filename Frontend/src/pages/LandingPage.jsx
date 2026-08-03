// Frontend/src/pages/LandingPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const LandingPage = () => {
  const roles = [
    {
      title: 'Passenger',
      description: 'Track live buses, view routes, and get real-time ETAs.',
      loginLink: '/passenger/login',
      registerLink: '/passenger/register',
      color: 'border-blue-500 text-blue-600',
      btnColor: 'bg-blue-600 hover:bg-blue-700',
      icon: '🚌'
    },
    {
      title: 'Driver',
      description: 'Start your route, share live location, and manage trips.',
      loginLink: '/driver/login',
      registerLink: '/driver/register',
      color: 'border-green-500 text-green-600',
      btnColor: 'bg-green-600 hover:bg-green-700',
      icon: '📱'
    },
    {
      title: 'Owner',
      description: 'Manage your fleet, view driver stats, and add vehicles.',
      loginLink: '/owner/login',
      registerLink: '/owner/register',
      color: 'border-purple-500 text-purple-600',
      btnColor: 'bg-purple-600 hover:bg-purple-700',
      icon: '🏢'
    },
    {
      title: 'Admin',
      description: 'System administration and global fleet overview.',
      loginLink: '/admin/login',
      registerLink: null, // Admin accounts are managed internally
      color: 'border-gray-700 text-gray-800',
      btnColor: 'bg-gray-800 hover:bg-gray-900',
      icon: '⚙️'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-800 mb-3">
          Real-Time Bus Tracking
        </h1>
        <p className="text-gray-600 max-w-xl mx-auto">
          Select your role below to log in or create a new account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
        {roles.map((role) => (
          <div
            key={role.title}
            className={`bg-white rounded-xl shadow-md border-t-4 ${role.color} p-6 flex flex-col justify-between`}
          >
            <div>
              <div className="text-4xl mb-3">{role.icon}</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{role.title}</h2>
              <p className="text-gray-600 text-sm mb-6">{role.description}</p>
            </div>

            <div className="flex gap-3">
              <Link
                to={role.loginLink}
                className={`flex-1 text-center text-white py-2 px-4 rounded-lg font-medium transition ${role.btnColor}`}
              >
                Log In
              </Link>
              {role.registerLink && (
                <Link
                  to={role.registerLink}
                  className="flex-1 text-center bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-medium border transition"
                >
                  Register
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LandingPage;