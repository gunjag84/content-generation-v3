import { PhotoGallery } from '../../components/photos/PhotoGallery';
import { useActiveBrand } from '../../store/activeBrand';

export function PhotosPage() {
  const { uid, brandId } = useActiveBrand();
  if (!uid || !brandId) return <p className="text-gray-500">Brand wird geladen ...</p>;
  return <PhotoGallery uid={uid} brandId={brandId} />;
}
