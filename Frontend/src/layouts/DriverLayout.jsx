import { Gauge, MapPinned, Route } from 'lucide-react';
import DashboardLayout from './DashboardLayout.jsx';

const navItems = [
  { label: 'Dashboard', href: '/driver', icon: Gauge },
  { label: 'Assigned Route', href: '/driver', icon: Route },
  { label: 'Map View', href: '/driver', icon: MapPinned },
];

function DriverLayout({ children }) {
  return (
    <DashboardLayout
      title="Driver"
      subtitle="Route operations"
      navItems={navItems}
    >
      {children}
    </DashboardLayout>
  );
}

export default DriverLayout;
