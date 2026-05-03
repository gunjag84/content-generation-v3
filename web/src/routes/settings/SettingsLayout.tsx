import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/settings/identity', label: 'Identity' },
  { to: '/settings/design', label: 'Design' },
  { to: '/settings/focus-areas', label: 'Focus Areas' },
  { to: '/settings/library', label: 'Library' },
  { to: '/settings/photos', label: 'Photos' },
  { to: '/settings/methods', label: 'Methods' },
  { to: '/settings/api-keys', label: 'API Keys' },
  { to: '/settings/instagram', label: 'Instagram' },
];

export function SettingsLayout() {
  return (
    <div className="flex min-h-full">
      <aside className="w-56 bg-white border-r border-gray-200 p-4 space-y-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${isActive ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'}`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </aside>
      <section className="flex-1 p-8">
        <Outlet />
      </section>
    </div>
  );
}
