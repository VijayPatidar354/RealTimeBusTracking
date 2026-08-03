import PassengerLayout from "../layouts/PassengerLayout.jsx";
import OwnerLayout from "../layouts/OwnerLayout.jsx";
import AdminLayout from "../layouts/AdminLayout.jsx";
import HomeLayout from "../layouts/HomeLayout.jsx";
import PassengerDashboard from "../pages/passenger/PassengerDashboard.jsx";
import PassengerLogin from "../pages/passenger/PassengerLogin.jsx";
import PassengerRegister from "../pages/passenger/PassengerRegister.jsx";
import PassengerRouteMap from "../pages/passenger/PassengerRouteMap.jsx";
import PassengerTrips from "../pages/passenger/PassengerTrips.jsx";
import DriverLogin from "../pages/driver/DriverLogin.jsx";
import DriverDashboard from "../pages/driver/DriverDashboard.jsx";
import DriverRegister from "../pages/driver/DriverRegister.jsx";
import OwnerLogin from "../pages/owner/OwnerLogin.jsx";
import OwnerRegister from "../pages/owner/OwnerRegister.jsx";
import OwnerDashboard from "../pages/owner/OwnerDashboard.jsx";
import AdminLogin from "../pages/admin/AdminLogin.jsx";
import AdminDashboard from "../pages/admin/AdminDashboard.jsx";
import LandingPage from "../pages/LandingPage.jsx";
import { DriverAuthProvider } from "../context/DriverAuthContext.jsx";
import { OwnerAuthProvider } from "../context/OwnerAuthContext.jsx";
import { AdminAuthProvider } from "../context/AdminAuthContext.jsx";

export const appRoutes = [
  // ── Passenger ───────────────────────────────────────────────────
  {
    path: "/home",
    element: (
      <HomeLayout>
        <LandingPage />
      </HomeLayout>
    ),
  },

  {
    path: "/passenger",
    element: (
      <PassengerLayout>
        <PassengerDashboard />
      </PassengerLayout>
    ),
  },
  {
    path: "/passenger/login",
    element: (
      <PassengerLayout>
        <PassengerLogin />
      </PassengerLayout>
    ),
  },
  {
    path: "/passenger/register",
    element: (
      <PassengerLayout>
        <PassengerRegister />
      </PassengerLayout>
    ),
  },
  {
    path: "/passenger/map",
    element: (
      <PassengerLayout>
        <PassengerRouteMap />
      </PassengerLayout>
    ),
  },
  {
    path: "/passenger/trips",
    element: (
      <PassengerLayout>
        <PassengerTrips />
      </PassengerLayout>
    ),
  },

  // ── Driver ───────────────────────────────────────────────────────
  {
    path: "/driver/login",
    element: (
      <DriverAuthProvider>
        <DriverLogin />
      </DriverAuthProvider>
    ),
  },
  {
    path: "/driver/dashboard",
    element: (
      <DriverAuthProvider>
        <DriverDashboard />
      </DriverAuthProvider>
    ),
  },
  {
    path: "/driver",
    element: (
      <DriverAuthProvider>
        <DriverDashboard />
      </DriverAuthProvider>
    ),
  },
  {
    path: "/driver/register",
    element: (
      <DriverAuthProvider>
        <DriverRegister />
      </DriverAuthProvider>
    ),
  },
  // ── Owner ─────────────────────────────────────────────────────────
  {
    path: "/owner/login",
    element: (
      <OwnerAuthProvider>
        <OwnerLogin />
      </OwnerAuthProvider>
    ),
  },
  {
    path: "/owner/register",
    element: (
      <OwnerAuthProvider>
        <OwnerRegister />
      </OwnerAuthProvider>
    ),
  },
  {
    path: "/owner/dashboard",
    element: (
      <OwnerAuthProvider>
        <OwnerLayout>
          <OwnerDashboard />
        </OwnerLayout>
      </OwnerAuthProvider>
    ),
  },
  {
    path: "/owner",
    element: (
      <OwnerAuthProvider>
        <OwnerLayout>
          <OwnerDashboard />
        </OwnerLayout>
      </OwnerAuthProvider>
    ),
  },

  // ── Admin ─────────────────────────────────────────────────────────
  {
    path: "/admin/login",
    element: (
      <AdminAuthProvider>
        <AdminLogin />
      </AdminAuthProvider>
    ),
  },
  {
    path: "/admin/dashboard",
    element: (
      <AdminAuthProvider>
        <AdminLayout>
          <AdminDashboard />
        </AdminLayout>
      </AdminAuthProvider>
    ),
  },
  {
    path: "/admin",
    element: (
      <AdminAuthProvider>
        <AdminLayout>
          <AdminDashboard />
        </AdminLayout>
      </AdminAuthProvider>
    ),
  },
];
