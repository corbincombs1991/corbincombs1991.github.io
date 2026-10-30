'use strict';
// Editorial display labels; source post links preserve the provenance of each photo.
// Reserved for a future store: checkout rendering is not enabled yet.
const photographs = [
  {id:'01',title:'Granite & cloud',category:'landscapes',width:640,height:378,alt:'Clouds and warm light over granite cliffs in a forested mountain valley',post:'Ce1OtaIuCEO'},
  {id:'02',title:'After the sun',category:'after-dark',width:513,height:640,alt:'The Milky Way above a dark rocky shoreline and silhouettes of evergreen trees',post:'Cfoq7Q4Ouwg'},
  {id:'03',title:'Last light',category:'landscapes',width:640,height:427,alt:'A pink sunset behind misty hills, evergreen trees, and golden autumn leaves',post:'CeoROWKuF1C'},
  {id:'04',title:'Blue distance',category:'landscapes',width:640,height:414,alt:'Layers of blue mountain ridges receding beneath a peach-colored evening sky',post:'CVgNSj9leV0'},
  {id:'05',title:'River country',category:'landscapes',width:640,height:388,alt:'Clear turquoise river beside a rocky bank, evergreen forest, and distant mountain peaks',post:'CLmotKAlAFU'},
  {id:'06',title:'Still water',category:'landscapes',width:640,height:427,alt:'A blue lake surrounded by evergreen forest under scattered white clouds',post:'CJq_inhFYMd'},
  {id:'07',title:'Small wonders',category:'details',width:640,height:640,alt:'White daffodils with yellow centers lit against a deep blue background',post:'CJEVTy1lv0o'},
  {id:'08',title:'Electric hours',category:'after-dark',width:640,height:640,alt:'Red traffic lights and neon blue storefronts reflected on an empty city street at night',post:'CI8nz47F-6Y'},
  {id:'09',title:'Open sky',category:'landscapes',width:640,height:427,alt:'Bright turquoise sky and white clouds above a shadowed mountain ridge',post:'CIyTpKHF1a1'},
  {id:'10',title:'At the edge',category:'landscapes',width:640,height:427,alt:'A rocky outcrop in the ocean beneath heavy clouds, photographed in black and white',post:'CIgJYg2lUpz'},
  {id:'11',title:'Red earth',category:'landscapes',width:640,height:427,alt:'Tall red sandstone formations emerging from a green and brown mountain landscape',post:'CIQx49NlNxI'},
  {id:'12',title:'Passing weather',category:'landscapes',width:640,height:427,alt:'Low white clouds sweeping across blue mountain slopes and a red rocky hillside',post:'CIOF3DfF-H0'}
].map(photo => ({purchaseUrl:null,...photo,src:`images/photo-${photo.id}.jpg`}));
const labels = {'landscapes':'LANDSCAPES','after-dark':'AFTER DARK','details':'DETAILS'};
const gallery = document.querySelector('#gallery');
const moreButton = document.querySelector('#show-more');
const dialog = document.querySelector('.lightbox');
let selectedFilter = 'all';
let expanded = false;
let viewerPhotos = photographs;
let viewerIndex = 0;
let opener;
const filteredPhotos = () => photographs.filter(photo => selectedFilter === 'all' || photo.category === selectedFilter);
function renderGallery() {
  const matches = filteredPhotos();
  const visible = expanded ? matches : matches.slice(0,6);
  gallery.replaceChildren(...visible.map(photo => {
    const figure = document.createElement('figure');
    figure.className = `photo-card${photo.height > photo.width ? ' portrait' : ''}`;
    const button = document.createElement('button');
    button.className = 'photo-button photo-open';
    button.dataset.photo = photo.id;
    button.setAttribute('aria-label', `Open ${photo.title} in full-screen viewer`);
    const image = new Image(photo.width,photo.height);
    image.src = photo.src;
    image.alt = photo.alt;
    image.loading = 'lazy';
    image.decoding = 'async';
    const expand = document.createElement('span');
    expand.className = 'expand-icon'; expand.textContent = '↗'; expand.setAttribute('aria-hidden','true');
    button.append(image,expand);
    const caption = document.createElement('figcaption');
    const titleWrap = document.createElement('div'); titleWrap.className = 'photo-title';
    const number = document.createElement('span'); number.className = 'photo-number'; number.textContent = photo.id;
    const title = document.createElement('h3'); title.textContent = photo.title;
    const category = document.createElement('span'); category.className = 'photo-category'; category.textContent = labels[photo.category];
    titleWrap.append(number,title); caption.append(titleWrap,category); figure.append(button,caption);
    return figure;
  }));
  document.querySelector('.gallery-count').textContent = `${visible.length} / ${matches.length} PHOTOGRAPHS`;
  moreButton.hidden = visible.length >= matches.length;
  moreButton.innerHTML = `View all ${matches.length} photographs <span aria-hidden="true">↓</span>`;
}
document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {
  selectedFilter = button.dataset.filter; expanded = false;
  document.querySelectorAll('[data-filter]').forEach(filter => filter.setAttribute('aria-pressed',String(filter === button)));
  renderGallery();
}));
moreButton.addEventListener('click', () => {
  const previousCount = gallery.children.length;
  expanded = true; renderGallery();
  gallery.children[previousCount]?.querySelector('button').focus({preventScroll:true});
});
function renderViewer() {
  const photo = viewerPhotos[viewerIndex];
  const image = document.querySelector('#viewer-image');
  image.src = photo.src; image.alt = photo.alt;
  document.querySelector('#viewer-title').textContent = photo.title;
  document.querySelector('#viewer-category').textContent = labels[photo.category];
  document.querySelector('#viewer-position').textContent = `${String(viewerIndex+1).padStart(2,'0')} / ${String(viewerPhotos.length).padStart(2,'0')}`;
  document.querySelector('#viewer-source').href = `https://www.instagram.com/p/${photo.post}/`;
  document.querySelectorAll('.viewer-prev,.viewer-next').forEach(button => {button.disabled = viewerPhotos.length < 2;button.hidden = viewerPhotos.length < 2;});
}
function stepViewer(step) {viewerIndex = (viewerIndex + step + viewerPhotos.length) % viewerPhotos.length;renderViewer();}
document.addEventListener('click', event => {
  const button = event.target.closest('.photo-open');
  if (!button) return;
  opener = button;
  viewerPhotos = button.classList.contains('hero-image') ? photographs : filteredPhotos();
  viewerIndex = viewerPhotos.findIndex(photo => photo.id === button.dataset.photo);
  renderViewer(); dialog.showModal(); document.body.classList.add('viewer-open');
  document.querySelector('.viewer-close').focus();
});
document.querySelector('.viewer-close').addEventListener('click', () => dialog.close());
document.querySelector('.viewer-prev').addEventListener('click', () => stepViewer(-1));
document.querySelector('.viewer-next').addEventListener('click', () => stepViewer(1));
dialog.addEventListener('close', () => {document.body.classList.remove('viewer-open');opener?.focus({preventScroll:true});});
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {event.preventDefault();stepViewer(event.key === 'ArrowRight' ? 1 : -1);}
});
let touchStart = null;
const stage = document.querySelector('.viewer-stage');
stage.addEventListener('touchstart', event => {touchStart = event.touches.length === 1 ? {x:event.touches[0].clientX,y:event.touches[0].clientY} : null;},{passive:true});
stage.addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)*1.5) stepViewer(dx < 0 ? 1 : -1);
  touchStart = null;
},{passive:true});
stage.addEventListener('touchcancel', () => {touchStart = null;},{passive:true});
document.querySelector('#back-top').addEventListener('click', event => {event.preventDefault();window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});document.querySelector('.brand').focus({preventScroll:true});});
document.querySelector('#year').textContent = new Date().getFullYear();
renderGallery();
