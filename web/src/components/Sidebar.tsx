import { NavLink } from 'react-router-dom';

const ROUTES = [
  { to: '/',         label: 'Dashboard' },
  { to: '/create',   label: 'Create' },
  { to: '/posts',    label: 'Posts' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/settings', label: 'Settings' },
];

export function Sidebar() {
  return (
    <nav className="w-48 bg-gray-900 text-gray-100 min-h-screen p-4 space-y-1">
      {ROUTES.map((r) => (
        <NavLink key={r.to} to={r.to} end={r.to === '/'}
          className={({ isActive }) => `block px-3 py-2 rounded ${isActive ? 'bg-gray-700' : 'hover:bg-gray-800'}`}>
          {r.label}
        </NavLink>
      ))}
    </nav>
  );
}
