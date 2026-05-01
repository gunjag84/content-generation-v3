import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuthStore } from '../store/auth';
import { BrandSwitcher } from './BrandSwitcher';

export function Header() {
  const user = useAuthStore((s) => s.user);
  return (
    <header className="flex items-center justify-between border-b px-6 py-3 bg-white">
      <div className="font-semibold">Content Generation</div>
      <div className="flex items-center gap-4">
        <BrandSwitcher />
        <span className="text-sm text-gray-500">{user?.email}</span>
        <button onClick={() => signOut(auth)} className="text-sm text-gray-500 hover:underline">Abmelden</button>
      </div>
    </header>
  );
}
