import { Home, MapPinned, TicketCheck } from 'lucide-react';
import PassengerAuthControls from '../components/passenger/PassengerAuthControls.jsx';
import DashboardLayout from './DashboardLayout.jsx';

const navItems = [
  { label: 'Dashboard', href: '/passenger',      icon: Home },
  { label: 'Route Map', href: '/passenger/map',  icon: MapPinned },
  { label: 'Trips',     href: '/passenger/trips', icon: TicketCheck },
];

function PassengerLayout({ children }) {
  return (
    <DashboardLayout
      title="Passenger"
      subtitle="Live travel experience"
      navItems={navItems}
      headerActions={<PassengerAuthControls />}
    >
      {children}
    </DashboardLayout>
  );
}

export default PassengerLayout;
