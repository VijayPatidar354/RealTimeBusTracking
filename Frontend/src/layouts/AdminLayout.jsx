import { MapPin, Users, Route, Building2, Clock, ShieldCheck } from 'lucide-react';
import DashboardLayout from './DashboardLayout.jsx';

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: ShieldCheck },
  { label: 'Live Map',  href: '/admin/dashboard', icon: MapPin },
  { label: 'Drivers',   href: '/admin/dashboard', icon: Users },
  { label: 'Routes',    href: '/admin/dashboard', icon: Route },
  { label: 'Owners',    href: '/admin/dashboard', icon: Building2 },
  { label: 'Waiting',   href: '/admin/dashboard', icon: Clock },
];

function AdminLayout({ children }) {
  return (
    <DashboardLayout
      title="Admin"
      subtitle="Platform oversight"
      navItems={navItems}
    >
      {children}
    </DashboardLayout>
  );
}

export default AdminLayout;
