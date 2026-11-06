document.documentElement.classList.add('js');
const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');
function closeMenu(restoreFocus = false) {
  if (!menuButton || !nav) return;
  menuButton.setAttribute('aria-expanded', 'false');
  nav.classList.remove('is-open');
  document.body.classList.remove('menu-open');
  if (restoreFocus) menuButton.focus();
}
menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(isOpen));
  nav.classList.toggle('is-open', isOpen);
  document.body.classList.toggle('menu-open', isOpen);
});
nav?.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
document.addEventListener('click', event => {
  if (menuButton?.getAttribute('aria-expanded') === 'true' && !event.target.closest('.site-header')) closeMenu();
});
matchMedia('(min-width: 701px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const filters = [...document.querySelectorAll('[data-filter]')];
const plants = [...document.querySelectorAll('[data-category]')];
filters.forEach(button => button.addEventListener('click', () => {
  filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
  let visibleCount = 0;
  plants.forEach(plant => {
    plant.hidden = button.dataset.filter !== 'all' && !plant.dataset.category.split(' ').includes(button.dataset.filter);
    if (!plant.hidden) visibleCount++;
  });
  const status = document.querySelector('#filter-status');
  if (status) status.textContent = `${visibleCount} plant ${visibleCount === 1 ? 'collection' : 'collections'} shown`;
}));

const lightbox = document.querySelector('#photo-dialog');
const lightboxImage = lightbox?.querySelector('img');
const lightboxCaption = lightbox?.querySelector('#photo-caption');
let photoTrigger;
document.querySelectorAll('[data-photo]').forEach(button => button.addEventListener('click', () => {
  if (!lightbox || !lightboxImage) return;
  photoTrigger = button;
  lightboxImage.src = button.dataset.photo;
  lightboxImage.alt = button.querySelector('img').alt;
  lightboxCaption.textContent = button.querySelector('img').alt;
  lightbox.showModal();
  document.body.classList.add('modal-open');
}));
lightbox?.querySelector('button').addEventListener('click', () => lightbox.close());
lightbox?.addEventListener('click', event => {
  const bounds = lightbox.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) lightbox.close();
});
lightbox?.addEventListener('close', () => {
  document.body.classList.remove('modal-open');
  photoTrigger?.focus();
});
