import { PhotoGallery } from '../../components/photos/PhotoGallery';
import { useActiveBrand } from '../../store/activeBrand';

export function PhotosPage() {
  const { uid, brandId } = useActiveBrand();
  if (!uid || !brandId) return <p className="text-zinc-400">Brand wird geladen ...</p>;
  return <PhotoGallery uid={uid} brandId={brandId} />;
}
