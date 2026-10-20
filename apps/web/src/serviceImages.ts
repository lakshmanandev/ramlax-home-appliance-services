import type { ServiceView } from '@ramlax/shared';

const cardFallbacks: Record<string, string> = {
  ac: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1000&q=80',
  tv: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=1000&q=80',
  ro: 'https://images.unsplash.com/photo-1662454378054-8613b673b11e?auto=format&fit=crop&w=1000&q=80',
  'washing-machine': 'https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=1000&q=80',
};

const galleryFallbacks: Record<string, string> = {
  ac: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1000&q=80',
  tv: 'https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1000&q=80',
  ro: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1000&q=80',
  'washing-machine': 'https://images.unsplash.com/photo-1604335399105-a0c585fd81a1?auto=format&fit=crop&w=1000&q=80',
};

const extraFallbacks = [
  'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80',
  'https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?auto=format&fit=crop&w=1000&q=80',
];

export function serviceImageSource(service: ServiceView, slot: 'card' | 'gallery', index = 0) {
  const imagePath = slot === 'card' ? service.imageUrl : service.galleryImageUrl;
  if (imagePath) {
    const apiUrl = import.meta.env.VITE_API_URL;
    const origin = apiUrl?.startsWith('http') ? new URL(apiUrl).origin : window.location.origin;
    return new URL(imagePath, origin).toString();
  }

  const fallbacks = slot === 'card' ? cardFallbacks : galleryFallbacks;
  return fallbacks[service.slug] || extraFallbacks[index % extraFallbacks.length];
}
