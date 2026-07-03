import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/settings/identity', label: 'Identity' },
  { to: '/settings/design', label: 'Design' },
  { to: '/settings/library', label: 'Library' },
  { to: '/settings/photos', label: 'Photos' },
  { to: '/settings/methods', label: 'Methods' },
  { to: '/settings/api-keys', label: 'API Keys' },
  { to: '/settings/instagram', label: 'Instagram' },
];

export function SettingsLayout() {
  return (
    <div className="flex min-h-full">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-700 p-4 space-y-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `block px-3 py-2 rounded text-sm ${isActive ? 'bg-zinc-800 text-cyan-400' : 'text-zinc-300 hover:bg-zinc-800'}`
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
