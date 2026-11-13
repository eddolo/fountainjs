const pendingImages = new WeakSet();
const pendingClasses = ['!gl-min-w-7', '!gl-min-h-7'];

/** Reserve visible loading geometry without changing authored or decoded sizes. */
export function prepareFountainReaderImages(images) {
  images.forEach(image => {
    if (image.tagName !== 'IMG' || image.getAttribute('loading') !== 'lazy' || image.complete
      || image.hasAttribute('width') || image.hasAttribute('height') || pendingImages.has(image)) return;
    const added = pendingClasses.filter(name => !image.classList.contains(name));
    const hadClass = image.hasAttribute('class');
    const pendingState = image.dataset;
    const finish = () => {
      image.classList.remove(...added);
      if (!hadClass && !image.classList.length) image.removeAttribute('class');
      delete pendingState.fountainReaderImagePending;
      pendingImages.delete(image);
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
    };
    pendingImages.add(image);
    image.addEventListener('load', finish);
    image.addEventListener('error', finish);
    pendingState.fountainReaderImagePending = '';
    image.classList.add(...added);
    if (image.complete) finish();
  });
}
