export function initCatalogApp(options = {}) {
  const config = {
    readonly: false,
    storageKey: 'tis-current-variant',
    ...options,
  };

  const els = {
    docList: document.getElementById('docList'),
    summary: document.getElementById('summary'),
    searchInput: document.getElementById('searchInput'),
    docTitle: document.getElementById('docTitle'),
    docMeta: document.getElementById('docMeta'),
    schemeImage: document.getElementById('schemeImage'),
    overlay: document.getElementById('overlay'),
    selectionTitle: document.getElementById('selectionTitle'),
    selectionMeta: document.getElementById('selectionMeta'),
    rowsContainer: document.getElementById('rowsContainer'),
    unmatchedContainer: document.getElementById('unmatchedContainer'),
    saveStatus: document.getElementById('saveStatus'),
    variantSelect: document.getElementById('variantSelect'),
    variantSummary: document.getElementById('variantSummary'),
    openDocTableButton: document.getElementById('openDocTableButton'),
    closeDocTableButton: document.getElementById('closeDocTableButton'),
    docTableModal: document.getElementById('docTableModal'),
    docTableContainer: document.getElementById('docTableContainer'),
    docTableTitle: document.getElementById('docTableTitle'),
  };

  const state = {
    variants: [],
    currentVariant: null,
    baseCatalog: null,
    catalog: null,
    overrides: { documents: {}, categories: [] },
    filteredDocs: [],
    currentDoc: null,
    currentMarkerId: null,
    expandedCategories: new Set(),
  };

  bindBaseEvents();
  init();

  async function init() {
    try {
      await loadVariants();
      if (!state.currentVariant) {
        els.summary.textContent = 'Нет доступных комплектаций';
        return;
      }
      await loadVariantData(state.currentVariant.id);
    } catch (err) {
      els.summary.textContent = 'Не удалось загрузить каталог';
      console.error(err);
    }
  }

  function bindBaseEvents() {
    els.searchInput?.addEventListener('input', () => {
      const q = els.searchInput.value.trim().toLowerCase();
      const docs = state.catalog?.documents || [];
      state.filteredDocs = docs.filter((doc) => {
        if (!q) return true;
        return doc.title.toLowerCase().includes(q) || doc.id.toLowerCase().includes(q);
      });
      renderDocList();
      if (!state.filteredDocs.find((d) => d.id === state.currentDoc?.id) && state.filteredDocs.length) {
        selectDocument(state.filteredDocs[0].id);
      }
    });

    els.variantSelect?.addEventListener('change', async () => {
      const nextId = els.variantSelect.value;
      if (nextId && nextId !== state.currentVariant?.id) {
        await loadVariantData(nextId);
      }
    });

    els.schemeImage?.addEventListener('load', () => {
      syncOverlaySize();
      renderMarkers();
    });

    window.addEventListener('resize', () => {
      if (state.currentDoc) syncOverlaySize();
      renderMarkers();
    });

    els.openDocTableButton?.addEventListener('click', openDocTableModal);
    els.closeDocTableButton?.addEventListener('click', closeDocTableModal);
    document.querySelectorAll('[data-close-modal="doc-table"]').forEach((el) => {
      el.addEventListener('click', closeDocTableModal);
    });
  }

  async function loadVariants() {
    const payload = await fetchJson('api/variants').catch(() => fetchJson('data/variants.json'));
    state.variants = Array.isArray(payload?.variants) ? payload.variants : [];
    const preferredId = getPreferredVariantId();
    state.currentVariant = state.variants.find((item) => item.id === preferredId) || state.variants[0] || null;
    renderVariantPicker();
  }

  function getPreferredVariantId() {
    const fromQuery = new URLSearchParams(window.location.search).get('variant');
    if (fromQuery) return fromQuery;
    try {
      return localStorage.getItem(config.storageKey) || '';
    } catch {
      return '';
    }
  }

  function rememberVariant(variantId) {
    try {
      localStorage.setItem(config.storageKey, variantId);
    } catch {}
  }

  async function loadVariantData(variantId) {
    const variant = state.variants.find((item) => item.id === variantId);
    if (!variant) throw new Error(`Unknown variant: ${variantId}`);
    state.currentVariant = variant;
    rememberVariant(variantId);
    renderVariantPicker();
    els.summary.textContent = 'Загрузка...';

    const catalogUrl = `api/catalog?variant=${encodeURIComponent(variantId)}`;
    const overridesUrl = `api/overrides?variant=${encodeURIComponent(variantId)}`;
    const [catalogRes, overridesRes] = await Promise.all([
      fetchJson(catalogUrl).catch(() => fetchJson(variant.catalogPath)),
      config.readonly
        ? Promise.resolve({ documents: {} })
        : fetchJson(overridesUrl).catch(() => fetchJson(variant.overridesPath).catch(() => ({ documents: {} }))),
    ]);

    state.baseCatalog = applyVariantAssets(catalogRes, variant);
    state.overrides = normalizeOverrides(overridesRes);
    state.catalog = mergeCatalogWithOverrides(state.baseCatalog, state.overrides);
    state.filteredDocs = state.catalog.documents || [];
    state.currentDoc = null;
    state.currentMarkerId = null;
    state.expandedCategories = new Set();
    els.searchInput.value = '';

    renderAll();
    config.onVariantLoaded?.({ state, elements: els, config, helpers });
  }

  function applyVariantAssets(catalog, variant) {
    const next = structuredClone(catalog || { documents: [], document_count: 0 });
    const assetsBase = (variant?.assetsBase || '').replace(/\/$/, '');
    if (!assetsBase) return next;
    for (const doc of next.documents || []) {
      const original = String(doc.scheme_image || '');
      const fileName = original.split('/').pop();
      if (fileName) doc.scheme_image = `${assetsBase}/pages/${fileName}`;
    }
    return next;
  }

  function renderAll() {
    els.summary.textContent = `${state.catalog?.document_count || 0} схем`;
    renderVariantSummary();
    renderDocList();
    if (!state.currentDoc && state.filteredDocs.length) {
      selectDocument(state.filteredDocs[0].id);
    } else {
      renderDocument();
    }
  }

  function renderVariantPicker() {
    if (!els.variantSelect) return;
    els.variantSelect.innerHTML = '';
    for (const variant of state.variants) {
      const option = document.createElement('option');
      option.value = variant.id;
      option.textContent = variant.title || variant.engine || variant.id;
      option.selected = variant.id === state.currentVariant?.id;
      els.variantSelect.appendChild(option);
    }
  }

  function renderVariantSummary() {
    if (!els.variantSummary) return;
    if (!state.currentVariant) {
      els.variantSummary.textContent = 'Комплектация не выбрана';
      return;
    }
    const parts = [state.currentVariant.title || state.currentVariant.id];
    if (state.currentVariant.engine) parts.push(state.currentVariant.engine);
    els.variantSummary.textContent = parts.join(' · ');
  }

  function renderDocList() {
    if (!els.docList) return;
    els.docList.innerHTML = '';

    const tree = buildDocTree();
    for (const group of tree) {
      const section = document.createElement('div');
      section.className = 'doc-category';
      section.dataset.categoryId = group.id;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'doc-category-header';
      header.innerHTML = `
        <span class="doc-category-toggle">${state.expandedCategories.has(group.id) ? '−' : '+'}</span>
        <span class="doc-category-title">${escapeHtml(group.title)}</span>
        <span class="doc-category-count">${group.docs.length}</span>
      `;
      header.addEventListener('click', () => {
        toggleCategory(group.id);
      });
      config.decorateCategoryHeader?.(header, group, { state, elements: els, config, helpers, section });
      section.appendChild(header);

      const items = document.createElement('div');
      items.className = `doc-category-items${state.expandedCategories.has(group.id) ? ' expanded' : ''}`;
      items.dataset.categoryId = group.id;
      for (const doc of group.docs) {
        const btn = document.createElement('button');
        btn.className = `doc-item doc-item--nested${state.currentDoc?.id === doc.id ? ' active' : ''}`;
        btn.dataset.docId = doc.id;
        btn.innerHTML = `
          <div class="doc-item-title">${escapeHtml(doc.title)}</div>
          <div class="doc-item-stats">стр. схемы ${doc.scheme_page} · меток ${doc.stats.matched_codes}/${doc.stats.total_codes}</div>
        `;
        btn.addEventListener('click', () => selectDocument(doc.id));
        config.decorateDocItem?.(btn, doc, group, { state, elements: els, config, helpers, items });
        items.appendChild(btn);
      }
      section.appendChild(items);
      els.docList.appendChild(section);
    }
  }

  function selectDocument(docId) {
    state.currentDoc = state.catalog?.documents.find((d) => d.id === docId) || null;
    state.currentMarkerId = null;
    renderDocList();
    renderDocument();
    config.onDocumentSelected?.({ state, elements: els, config, helpers });
  }

  function renderDocument() {
    const doc = state.currentDoc;
    if (!doc) return;
    els.docTitle.textContent = doc.title;
    els.docMeta.textContent = `scheme_page: ${doc.scheme_page} · table_pages: ${doc.table_pages.join(', ') || '—'} · найдено меток: ${doc.stats.matched_codes}/${doc.stats.total_codes}`;
    els.schemeImage.src = doc.scheme_image;
    syncOverlaySize();
    renderSelection(null);
    renderUnmatched();
    renderMarkers();
    config.onDocumentRendered?.({ state, elements: els, config, helpers });
  }

  function syncOverlaySize() {
    if (!els.overlay || !els.schemeImage) return;
    els.overlay.style.width = `${els.schemeImage.clientWidth}px`;
    els.overlay.style.height = `${els.schemeImage.clientHeight}px`;
  }

  function renderMarkers() {
    const doc = state.currentDoc;
    if (!doc || !els.overlay || !els.schemeImage?.naturalWidth || !els.schemeImage?.naturalHeight) return;
    els.overlay.innerHTML = '';
    const scaleX = els.schemeImage.clientWidth / els.schemeImage.naturalWidth;
    const scaleY = els.schemeImage.clientHeight / els.schemeImage.naturalHeight;
    for (const marker of doc.markers || []) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `marker${state.currentMarkerId === marker.editor_id ? ' active' : ''}`;
      el.textContent = marker.label;
      el.style.left = `${marker.rect.x * scaleX}px`;
      el.style.top = `${marker.rect.y * scaleY}px`;
      el.style.width = `${Math.max(marker.rect.w * scaleX, 28)}px`;
      el.style.height = `${Math.max(marker.rect.h * scaleY, 22)}px`;
      el.title = `${marker.label} (${marker.match_method || 'manual'})`;
      el.addEventListener('click', (event) => {
        event.stopPropagation();
        state.currentMarkerId = marker.editor_id;
        renderSelection(marker);
        renderMarkers();
        scrollToDetails();
        config.onMarkerSelected?.(marker, { state, elements: els, config, helpers, scaleX, scaleY, element: el });
      });
      config.decorateMarker?.(el, marker, { state, elements: els, config, helpers, scaleX, scaleY });
      els.overlay.appendChild(el);
    }
  }

  function renderSelection(marker) {
    if (!marker) {
      els.selectionTitle.textContent = 'Деталь не выбрана';
      els.selectionMeta.textContent = config.readonly ? 'Выберите красную метку на схеме' : 'Выберите метку или добавьте новую кликом по схеме';
      els.rowsContainer.innerHTML = '<div class="empty">После клика здесь появятся все строки таблицы для выбранного идентификатора.</div>';
      return;
    }
    els.selectionTitle.textContent = `Идентификатор ${marker.label}`;
    els.selectionMeta.textContent = `Код: ${marker.code} · источник: ${marker.match_method || 'manual'}`;
    const rows = (marker.rows || []).map((row) => `
      <tr>
        <td><span class="badge">${escapeHtml(row.code)}</span></td>
        <td>${escapeHtml(row.part_number || '—')}</td>
        <td>${escapeHtml(row.name || '—')}</td>
        <td>${escapeHtml(row.qty || '—')}</td>
      </tr>
    `).join('');
    els.rowsContainer.innerHTML = `
      <table class="rows-table">
        <thead><tr><th>Код</th><th>Номер детали</th><th>Наименование</th><th>Кол-во</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function scrollToDetails() {
    const target = els.selectionTitle || els.rowsContainer || els.unmatchedContainer;
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function getEffectiveUnmatchedCodes(doc) {
    if (!doc) return [];
    const matched = new Set((doc.markers || []).map((marker) => marker.code).filter(Boolean));
    return (doc.unmatched_codes || []).filter((item) => !matched.has(item.code));
  }

  function buildDocRows(doc) {
    const rows = [];
    const seen = new Set();
    for (const marker of doc?.markers || []) {
      for (const row of marker.rows || []) {
        const key = row.id || `${row.code}|${row.part_number}|${row.name}|${row.qty}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ ...row, __matchStatus: 'matched' });
      }
    }
    for (const item of getEffectiveUnmatchedCodes(doc)) {
      for (const row of item.rows || []) {
        const key = row.id || `${row.code}|${row.part_number}|${row.name}|${row.qty}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ ...row, __matchStatus: 'unmatched' });
      }
    }
    return rows;
  }

  function renderDocTableModal() {
    if (!els.docTableContainer || !els.docTableTitle) return;
    const doc = state.currentDoc;
    if (!doc) {
      els.docTableTitle.textContent = 'Схема не выбрана';
      els.docTableContainer.innerHTML = '<div class="empty">Сначала выберите схему.</div>';
      return;
    }
    const rows = buildDocRows(doc);
    els.docTableTitle.textContent = `${doc.title} · строк: ${rows.length}`;
    if (!rows.length) {
      els.docTableContainer.innerHTML = '<div class="empty">Для этой схемы нет строк таблицы.</div>';
      return;
    }
    els.docTableContainer.innerHTML = `
      <table class="doc-table-all">
        <thead><tr><th>Код</th><th>Номер детали</th><th>Наименование</th><th>Кол-во</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr class="${row.__matchStatus === 'unmatched' ? 'row-unmatched' : ''}">
              <td><span class="badge">${escapeHtml(row.code || '—')}</span></td>
              <td>${escapeHtml(row.part_number || '—')}</td>
              <td>${escapeHtml(row.name || '—')}</td>
              <td>${escapeHtml(row.qty || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function openDocTableModal() {
    if (!els.docTableModal) return;
    renderDocTableModal();
    els.docTableModal.hidden = false;
  }

  function closeDocTableModal() {
    if (!els.docTableModal) return;
    els.docTableModal.hidden = true;
  }

  function renderUnmatched() {
    const doc = state.currentDoc;
    if (!doc || !els.unmatchedContainer) return;
    const unmatched = getEffectiveUnmatchedCodes(doc);
    els.unmatchedContainer.innerHTML = `
      <div class="section-title">Нераспознанные коды: ${unmatched.length}</div>
      <div class="unmatched-grid">
        ${unmatched.map((item) => `
          <button class="unmatched-card" data-code="${escapeHtml(item.code)}" ${config.readonly ? 'disabled' : ''}>
            <div><strong>${escapeHtml(item.label)}</strong></div>
            <div>${escapeHtml(item.rows[0]?.part_number || '—')}</div>
          </button>`).join('') || '<div class="empty">Нет нераспознанных кодов для этой схемы.</div>'}
      </div>
    `;
    config.onUnmatchedRendered?.({ state, elements: els, config, helpers });
  }

  function normalizeOverrides(overrides) {
    if (overrides && typeof overrides === 'object' && typeof overrides.documents === 'object') {
      const normalized = {
        documents: overrides.documents || {},
      };
      if (Array.isArray(overrides.categories)) {
        normalized.categories = overrides.categories;
      }
      return normalized;
    }
    return { documents: {} };
  }

  function mergeCatalogWithOverrides(catalog, overrides) {
    const merged = structuredClone(catalog || { documents: [] });
    for (const doc of merged.documents || []) {
      const docOverride = overrides.documents?.[doc.id];
      doc.markers = (doc.markers || []).map(ensureMarkerId);
      if (!docOverride) {
        recalcDocStats(doc);
        continue;
      }
      if (typeof docOverride.title === 'string') doc.title = docOverride.title;
      if (Array.isArray(docOverride.markers)) doc.markers = docOverride.markers.map(ensureMarkerId);
      if (Array.isArray(docOverride.rowsByMarker)) {
        for (let i = 0; i < doc.markers.length; i += 1) {
          if (Array.isArray(docOverride.rowsByMarker[i])) {
            doc.markers[i].rows = docOverride.rowsByMarker[i];
          }
        }
      }
      recalcDocStats(doc);
    }
    if (Array.isArray(overrides.categories)) {
      merged.categories = overrides.categories;
    } else if (!Array.isArray(merged.categories)) {
      merged.categories = [];
    }
    return merged;
  }

  function ensureMarkerId(marker) {
    if (marker.editor_id) return marker;
    return { ...marker, editor_id: `${marker.code}-${round(marker.rect?.x || 0)}-${round(marker.rect?.y || 0)}` };
  }

  function recalcDocStats(doc) {
    const matched = new Set((doc.markers || []).map((marker) => marker.code).filter(Boolean));
    const unmatched = getEffectiveUnmatchedCodes(doc);
    const totalCodes = doc.stats?.total_codes ?? new Set([
      ...matched,
      ...(doc.unmatched_codes || []).map((item) => item.code).filter(Boolean),
    ]).size;
    doc.stats = {
      ...doc.stats,
      total_codes: totalCodes,
      matched_codes: totalCodes - unmatched.length,
      unmatched_codes: unmatched.length,
    };
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
    return res.json();
  }

  function getCurrentMarker() {
    return state.currentDoc?.markers.find((item) => item.editor_id === state.currentMarkerId) || null;
  }

  function buildDocTree() {
    const docs = state.filteredDocs || [];
    const categoryMap = new Map();
    const assignments = Array.isArray(state.catalog?.categories) ? state.catalog.categories : [];

    for (const category of assignments) {
      if (!category || !category.id) continue;
      categoryMap.set(category.id, {
        id: category.id,
        title: category.title || category.id,
        docs: [],
      });
    }

    const uncategorized = { id: '__uncategorized__', title: 'Без категории', docs: [] };
    const docToCategory = new Map();
    for (const category of assignments) {
      for (const docId of category.docIds || []) {
        docToCategory.set(docId, category.id);
      }
    }

    for (const doc of docs) {
      const categoryId = docToCategory.get(doc.id);
      const group = categoryId && categoryMap.get(categoryId) ? categoryMap.get(categoryId) : uncategorized;
      group.docs.push(doc);
    }

    const groups = [...categoryMap.values()].filter((group) => group.docs.length > 0);
    if (uncategorized.docs.length) groups.push(uncategorized);
    return groups;
  }

  function toggleCategory(categoryId) {
    if (state.expandedCategories.has(categoryId)) {
      state.expandedCategories.delete(categoryId);
    } else {
      state.expandedCategories.add(categoryId);
    }
    renderDocList();
  }

  const helpers = {
    fetchJson,
    normalizeOverrides,
    mergeCatalogWithOverrides,
    ensureMarkerId,
    recalcDocStats,
    getCurrentMarker,
    renderDocList,
    renderDocument,
    renderMarkers,
    renderSelection,
    renderUnmatched,
    scrollToDetails,
    buildDocRows,
    renderDocTableModal,
    openDocTableModal,
    closeDocTableModal,
    syncOverlaySize,
    selectDocument,
    buildDocTree,
    toggleCategory,
    escapeHtml,
    round,
    clamp,
    numberOr,
  };

  return { state, elements: els, config, helpers, loadVariantData };
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value) {
  return Math.round(value);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
