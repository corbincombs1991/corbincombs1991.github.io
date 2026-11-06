(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const DATA_ROOT = new URL('data/', document.baseURI);
  const state = {
    index: null, mode: 'latest', category: '', query: '', source: '', month: '',
    visible: PAGE_SIZE, months: new Map(), archiveTask: null, archiveFailures: [], renderToken: 0,
  };
  const $ = (id) => document.getElementById(id);
  const nodes = {
    articles: $('articles'), loading: $('loading-state'), error: $('error-state'),
    empty: $('empty-state'), notice: $('notice'), more: $('more-row'),
  };
  const categories = [...document.querySelectorAll('[data-category]')];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function externalLink(label, url, className = '') {
    const href = safeUrl(url);
    if (!href) return element('span', className, label);
    const link = element('a', className, label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }

  function dateValue(value) {
    if (!value || typeof value !== 'string') return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function timezone() {
    try {
      const zone = state.index?.timezone || 'America/Indiana/Indianapolis';
      new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
      return zone;
    } catch { return 'America/Indiana/Indianapolis'; }
  }

  function formatDate(value, full = false) {
    const date = dateValue(value);
    if (!date) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      ...(full ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}),
      timeZone: timezone(),
    }).format(date);
  }

  function monthLabel(month) {
    if (!/^\d{4}-\d{2}$/.test(month)) return month;
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${month}-15T12:00:00Z`));
  }

  function articleMonth(article) {
    // Archive membership follows when the collector first saw a story.
    const date = dateValue(article.first_seen_at || article.published_at);
    if (!date) return '';
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', timeZone: timezone() }).formatToParts(date);
    return `${parts.find((part) => part.type === 'year').value}-${parts.find((part) => part.type === 'month').value}`;
  }

  function cleanArticles(value) {
    if (!Array.isArray(value)) return [];
    return value.filter((article) => article && typeof article.id === 'string' && typeof article.title === 'string' && safeUrl(article.url));
  }

  function uniqueArticles(articles) {
    const unique = new Map();
    for (const article of articles) unique.set(article.id, article);
    return [...unique.values()].sort((a, b) => {
      const aDate = dateValue(a.published_at) || dateValue(a.first_seen_at);
      const bDate = dateValue(b.published_at) || dateValue(b.first_seen_at);
      return (bDate?.getTime() || 0) - (aDate?.getTime() || 0) || a.id.localeCompare(b.id);
    });
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { cache: 'no-cache', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timeout); }
  }

  function showNotice(message, retry = false) {
    nodes.notice.replaceChildren();
    nodes.notice.hidden = !message;
    if (!message) return;
    nodes.notice.append(document.createTextNode(message));
    if (retry) {
      const button = element('button', '', 'Retry missing months');
      button.type = 'button';
      button.addEventListener('click', () => refreshResults());
      nodes.notice.append(button);
    }
  }

  function updateHeader() {
    const index = state.index;
    $('article-count').textContent = Number.isFinite(index.article_count) ? index.article_count.toLocaleString('en-US') : index.latest.length.toLocaleString('en-US');
    $('source-count').textContent = String(index.sources.length);
    $('schedule').textContent = index.schedule || 'Daily at 7:00 AM Eastern';
    const updated = dateValue(index.last_successful_run);
    const stale = !updated || Date.now() - updated.getTime() > 36 * 60 * 60 * 1000;
    const failed = index.sources.filter((source) => source.status === 'error').length;
    $('update-strip').classList.toggle('stale', stale || failed > 0);
    if (stale) {
      $('freshness').textContent = updated ? `Update overdue · last collected ${formatDate(index.last_successful_run, true)}` : 'Waiting for the first successful collection';
    } else {
      $('freshness').textContent = `Updated ${formatDate(index.last_successful_run, true)}${failed ? ` · ${failed} source${failed === 1 ? '' : 's'} unavailable` : ''}`;
    }
    $('footer-update').textContent = updated ? `Last collected ${formatDate(index.last_successful_run, true)}` : 'The Daily / Waiting for the first collection';
    if (typeof index.summary_method === 'string' && index.summary_method.trim()) {
      $('summary-method').textContent = index.summary_method;
    }
  }

  function populateFilters() {
    $('source-filter').replaceChildren(new Option('All sources', ''));
    for (const source of [...state.index.sources].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      $('source-filter').append(new Option(source.name || source.id, source.id));
    }
    $('month-filter').replaceChildren(new Option('All months', ''));
    for (const month of state.index.months) {
      $('month-filter').append(new Option(monthLabel(month.month), month.month));
    }
    $('source-filter').value = state.source;
    $('month-filter').value = state.month;
  }

  function renderSources() {
    const list = $('source-list');
    list.replaceChildren();
    if (!state.index.sources.length) {
      list.append(element('li', 'source-placeholder', 'No sources have been published yet.'));
      return;
    }
    for (const source of state.index.sources) {
      const item = element('li');
      const heading = element('div', 'source-heading');
      heading.append(externalLink(source.name || source.id, source.url));
      const failed = source.status === 'error';
      heading.append(element('span', `source-health${failed ? ' error' : ''}`, failed ? 'Unavailable' : source.status === 'unchanged' ? 'No changes' : 'Available'));
      item.append(heading);
      const detail = [source.category, source.last_success_at ? `Last checked ${formatDate(source.last_success_at, true)}` : 'No successful fetch yet'].filter(Boolean).join(' · ');
      item.append(element('p', 'source-description', detail));
      if (failed) item.append(element('p', 'source-description', source.error || 'This feed could not be collected on the latest run.'));
      list.append(item);
    }
  }

  function renderStory(article, featured) {
    const story = element('article', `story${featured ? ' featured' : ''}`);
    const meta = element('p', 'story-meta');
    meta.append(element('span', 'topic', article.category || 'Reading'));
    const separator = element('span', 'meta-separator');
    separator.setAttribute('aria-hidden', 'true');
    meta.append(separator);
    const published = dateValue(article.published_at);
    const date = published || dateValue(article.first_seen_at);
    const time = element('time', '', `${published ? '' : 'Collected '}${formatDate(date?.toISOString())}`);
    if (date) time.dateTime = date.toISOString();
    meta.append(time);
    const heading = element('h3');
    heading.append(externalLink(article.title, article.url));
    const summary = typeof article.summary === 'string' ? article.summary.trim() : '';
    const headlineOnly = article.summary_kind === 'headline_only' || !summary;
    const excerpt = element('p', `story-summary${headlineOnly ? ' empty-summary' : ''}`, headlineOnly ? 'This feed provides a headline only. Read the original for the full story.' : summary);
    const footer = element('div', 'story-footer');
    const attribution = element('div');
    attribution.append(element('span', 'source-label', article.source || 'Original source'));
    const method = headlineOnly ? 'Headline only' : article.summary_kind === 'extractive' ? 'Extracted from the source feed' : 'Source feed excerpt';
    attribution.append(element('span', 'summary-label', method));
    const links = element('div', 'story-links');
    if (safeUrl(article.discussion_url) && article.discussion_url !== article.url) {
      const discussion = externalLink('Discussion', article.discussion_url);
      discussion.append(element('span', '', '↗'));
      links.append(discussion);
    }
    const read = externalLink('Read original', article.url);
    read.append(element('span', '', '↗'));
    links.append(read);
    footer.append(attribution, links);
    story.append(meta, heading, excerpt, footer);
    return story;
  }

  async function loadArchive() {
    if (state.archiveTask) return state.archiveTask;
    state.archiveTask = (async () => {
      const pending = state.index.months.filter((month) => !state.months.has(month.month));
      const failures = [];
      // Keep a long-lived archive gentle on the browser and static host.
      let cursor = 0;
      async function worker() {
        while (cursor < pending.length) {
          const descriptor = pending[cursor++];
          try {
            if (descriptor.url !== `archive/${descriptor.month}.json`) throw new Error('Invalid archive URL');
            const payload = await fetchJson(new URL(descriptor.url, DATA_ROOT));
            if (!payload || !Array.isArray(payload.articles)) throw new Error('Invalid archive data');
            state.months.set(descriptor.month, cleanArticles(payload.articles));
          } catch { failures.push(descriptor.month); }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
      state.archiveFailures = failures;
    })();
    try { await state.archiveTask; }
    finally { state.archiveTask = null; }
  }

  function needsArchive() { return state.mode === 'archive' || Boolean(state.query) || Boolean(state.month); }

  function filteredArticles() {
    const useArchive = needsArchive();
    const pool = useArchive ? [...state.index.latest, ...[...state.months.values()].flat()] : state.index.latest;
    const words = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const monthArticles = state.months.get(state.month);
    const monthIds = monthArticles ? new Set(monthArticles.map((article) => article.id)) : null;
    return uniqueArticles(pool).filter((article) => {
      if (state.category && article.category !== state.category) return false;
      if (state.source && article.source_id !== state.source) return false;
      if (state.month) {
        if (monthIds ? !monthIds.has(article.id) : articleMonth(article) !== state.month) return false;
      }
      const haystack = [article.title, article.summary, article.source, article.category].filter(Boolean).join(' ').toLocaleLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }

  function updateControls() {
    $('latest-view').classList.toggle('active', state.mode === 'latest');
    $('latest-view').setAttribute('aria-pressed', String(state.mode === 'latest'));
    $('archive-view').classList.toggle('active', state.mode === 'archive');
    $('archive-view').setAttribute('aria-pressed', String(state.mode === 'archive'));
    for (const button of categories) {
      const selected = button.dataset.category === state.category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    $('clear-filters').hidden = !(state.category || state.query || state.source || state.month);
    $('stories-title').textContent = state.query ? 'Search the collection' : state.month ? monthLabel(state.month) : state.mode === 'archive' ? 'The whole collection' : 'Fresh off the feeds';
  }

  function renderResults() {
    const matches = filteredArticles();
    const shown = matches.slice(0, state.visible);
    nodes.articles.replaceChildren(...shown.map((article, i) => renderStory(article, i === 0)));
    nodes.articles.setAttribute('aria-busy', 'false');
    nodes.loading.hidden = true;
    nodes.error.hidden = true;
    nodes.empty.hidden = matches.length > 0;
    nodes.more.hidden = matches.length === 0;
    const filtered = Boolean(state.category || state.query || state.source || state.month);
    $('empty-title').textContent = filtered ? 'No stories found' : 'A new collection is taking shape';
    $('empty-message').textContent = filtered ? 'Try another search or clear a filter to widen the collection.' : 'Stories will appear here after the first successful daily collection.';
    $('empty-clear').hidden = !filtered;
    $('load-more').hidden = shown.length >= matches.length;
    $('visible-count').textContent = `${shown.length.toLocaleString('en-US')} of ${matches.length.toLocaleString('en-US')} stories${shown.length >= matches.length ? ' · You’re all caught up' : ''}`;
    $('results-count').textContent = `${matches.length.toLocaleString('en-US')} ${matches.length === 1 ? 'story' : 'stories'}${needsArchive() ? ' in the archive' : ' in the latest collection'}`;
    if (needsArchive() && state.archiveFailures.length) {
      showNotice(`${state.archiveFailures.length} archive month${state.archiveFailures.length === 1 ? '' : 's'} couldn’t load. These results include the stories available so far.`, true);
    } else { showNotice(''); }
  }

  async function refreshResults() {
    if (!state.index) return;
    const token = ++state.renderToken;
    updateControls();
    if (needsArchive() && state.index.months.some((month) => !state.months.has(month.month))) {
      nodes.articles.setAttribute('aria-busy', 'true');
      showNotice('Opening the monthly archives…');
      await loadArchive();
    }
    if (token !== state.renderToken) return;
    renderResults();
  }

  function resetFilters() {
    state.category = ''; state.query = ''; state.source = ''; state.month = '';
    state.visible = PAGE_SIZE;
    $('search').value = ''; $('source-filter').value = ''; $('month-filter').value = '';
    refreshResults();
  }

  function setMode(mode) {
    state.mode = mode; state.visible = PAGE_SIZE;
    if (mode === 'latest') {
      state.query = ''; state.month = '';
      $('search').value = ''; $('month-filter').value = '';
    }
    refreshResults();
  }

  async function initialize() {
    nodes.error.hidden = true;
    nodes.loading.hidden = false;
    nodes.articles.setAttribute('aria-busy', 'true');
    try {
      const index = await fetchJson(new URL('index.json', DATA_ROOT));
      if (!index || index.schema_version !== 1 || !Array.isArray(index.latest) || !Array.isArray(index.months) || !Array.isArray(index.sources)) throw new Error('Invalid collection data');
      state.index = {
        ...index,
        latest: cleanArticles(index.latest),
        sources: index.sources.filter((source) => source && typeof source.id === 'string'),
        months: index.months.filter((month) => month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month.month)).sort((a, b) => b.month.localeCompare(a.month)),
      };
      updateHeader(); populateFilters(); renderSources();
      await refreshResults();
    } catch {
      nodes.loading.hidden = true;
      nodes.error.hidden = false;
      nodes.articles.setAttribute('aria-busy', 'false');
      $('freshness').textContent = 'Collection temporarily unavailable';
      $('update-strip').classList.add('stale');
      $('error-message').textContent = 'The published collection is temporarily unavailable. Please try again in a moment.';
    }
  }

  let searchTimer;
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = $('search').value.trim();
      state.visible = PAGE_SIZE;
      if (state.query) state.mode = 'archive';
      refreshResults();
    }, 200);
  });
  $('source-filter').addEventListener('change', (event) => { state.source = event.target.value; state.visible = PAGE_SIZE; refreshResults(); });
  $('month-filter').addEventListener('change', (event) => { state.month = event.target.value; state.mode = 'archive'; state.visible = PAGE_SIZE; refreshResults(); });
  for (const button of categories) {
    button.addEventListener('click', () => { state.category = button.dataset.category; state.visible = PAGE_SIZE; refreshResults(); });
  }
  $('latest-view').addEventListener('click', () => setMode('latest'));
  $('archive-view').addEventListener('click', () => setMode('archive'));
  $('browse-archive').addEventListener('click', () => {
    setMode('archive');
    $('reading-room').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    $('archive-view').focus({ preventScroll: true });
  });
  $('clear-filters').addEventListener('click', resetFilters);
  $('empty-clear').addEventListener('click', resetFilters);
  $('retry').addEventListener('click', initialize);
  $('load-more').addEventListener('click', () => {
    const previousCount = state.visible;
    state.visible += PAGE_SIZE;
    renderResults();
    // A keyboard reader continues at the first newly revealed story.
    const nextLink = nodes.articles.children[previousCount]?.querySelector('h3 a');
    if (nextLink) nextLink.focus({ preventScroll: true });
  });
  initialize();
})();
