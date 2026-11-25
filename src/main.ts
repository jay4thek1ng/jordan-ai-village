// Router: the cozy rooms village is the default; the old views stay reachable.
//   ?style=pixel   old pixel-art town
//   ?area=chappie  Chappie's isometric preview (part of the pixel build)
const q = new URLSearchParams(location.search);
if (q.get('style') === 'pixel' || q.get('area') === 'chappie') {
  void import('./pixel');
} else {
  void import('./rooms').then((m) => m.startRooms());
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      // offline support is a bonus; the village still works without it
    });
  });
}
