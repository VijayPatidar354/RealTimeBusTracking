import { Bus, LayoutDashboard, Route } from 'lucide-react';
import DashboardLayout from './DashboardLayout.jsx';

const navItems = [
  { label: 'Dashboard', href: '/owner/dashboard', icon: LayoutDashboard },
  { label: 'Buses',     href: '/owner/dashboard', icon: Bus },
  { label: 'Routes',    href: '/owner/dashboard', icon: Route },
];

function OwnerLayout({ children }) {
  return (
    <DashboardLayout
      title="Owner"
      subtitle="Fleet management"
      navItems={navItems}
    >
      {children}
    </DashboardLayout>
  );
}

export default OwnerLayout;
