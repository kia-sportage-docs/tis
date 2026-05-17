const state = {
  baseCatalog: null,
  catalog: null,
  overrides: { documents: {} },
  filteredDocs: [],
  currentDoc: null,
  currentMarkerId: null,
  editMode: false,
  selectedCode: '',
  saveEnabled: false,
  saveStatus: 'Только просмотр',
  dragState: null,
  undoStack: [],
  redoStack: [],
  restoringHistory: false,
};

const docList = document.getElementById('docList');
const summary = document.getElementById('summary');
const searchInput = document.getElementById('searchInput');
const docTitle = document.getElementById('docTitle');
const docMeta = document.getElementById('docMeta');
const schemeImage = document.getElementById('schemeImage');
const overlay = document.getElementById('overlay');
const selectionTitle = document.getElementById('selectionTitle');
const selectionMeta = document.getElementById('selectionMeta');
const rowsContainer = document.getElementById('rowsContainer');
const unmatchedContainer = document.getElementById('unmatchedContainer');
const editToggle = document.getElementById('editToggle');
const undoButton = document.getElementById('undoButton');
const redoButton = document.getElementById('redoButton');
const saveButton = document.getElementById('saveButton');
const saveStatus = document.getElementById('saveStatus');
const titleInput = document.getElementById('titleInput');
const codeSelect = document.getElementById('codeSelect');
const selectedCodeMeta = document.getElementById('selectedCodeMeta');
const deleteMarkerButton = document.getElementById('deleteMarkerButton');
const editorHint = document.getElementById('editorHint');
const markerEditor = document.getElementById('markerEditor');
const markerLabelInput = document.getElementById('markerLabelInput');
const markerCodeInput = document.getElementById('markerCodeInput');
const markerXInput = document.getElementById('markerXInput');
const markerYInput = document.getElementById('markerYInput');
const markerWInput = document.getElementById('markerWInput');
const markerHInput = document.getElementById('markerHInput');
const markerRowsPreview = document.getElementById('markerRowsPreview');

init();

async function init() {
  try {
    const [catalogRes, overridesRes] = await Promise.all([
      fetchJson('api/catalog').catch(() => fetchJson('data/catalog.json')),
      fetchJson('api/overrides').catch(() => ({ documents: {} })),
    ]);
    state.baseCatalog = catalogRes;
    state.overrides = normalizeOverrides(overridesRes);
    state.catalog = mergeCatalogWithOverrides(state.baseCatalog, state.overrides);
    state.filteredDocs = state.catalog.documents;
    state.saveEnabled = true;
    state.saveStatus = 'Готово к редактированию';
    renderAll();
  } catch (err) {
    summary.textContent = 'Не удалось загрузить каталог';
    console.error(err);
  }
}

function renderAll() {
  summary.textContent = `${state.catalog.document_count} схем`;
  renderDocList();
  if (!state.currentDoc && state.filteredDocs.length) {
    selectDocument(state.filteredDocs[0].id);
  } else {
    renderDocument();
  }
  renderToolbarState();
}

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  state.filteredDocs = state.catalog.documents.filter((doc) => {
    if (!q) return true;
    return doc.title.toLowerCase().includes(q) || doc.id.toLowerCase().includes(q);
  });
  renderDocList();
  if (!state.filteredDocs.find((d) => d.id === state.currentDoc?.id) && state.filteredDocs.length) {
    selectDocument(state.filteredDocs[0].id);
  }
});

editToggle.addEventListener('change', () => {
  state.editMode = editToggle.checked;
  renderToolbarState();
  placeMarkers();
  renderUnmatched();
});

undoButton.addEventListener('click', undoChange);
redoButton.addEventListener('click', redoChange);
saveButton.addEventListener('click', saveOverrides);

titleInput.addEventListener('focus', snapshotHistory);
titleInput.addEventListener('input', () => {
  if (!state.currentDoc) return;
  state.currentDoc.title = titleInput.value;
  upsertDocOverride();
  renderDocList();
  docTitle.textContent = state.currentDoc.title;
  renderToolbarState();
});

codeSelect.addEventListener('change', () => {
  state.selectedCode = codeSelect.value;
  renderCodeSelectionMeta();
});

deleteMarkerButton.addEventListener('click', () => {
  const marker = getCurrentMarker();
  if (!marker || !state.currentDoc) return;
  snapshotHistory();
  state.currentDoc.markers = state.currentDoc.markers.filter((item) => item.editor_id !== marker.editor_id);
  state.currentMarkerId = null;
  refreshCurrentDocData();
});

for (const input of [markerLabelInput, markerCodeInput, markerXInput, markerYInput, markerWInput, markerHInput]) {
  input.addEventListener('focus', snapshotHistory);
  input.addEventListener('input', updateMarkerFromForm);
}

overlay.addEventListener('click', (event) => {
  if (!state.editMode || !state.selectedCode || event.target !== overlay) return;
  const rect = overlay.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 0, rect.width);
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  addMarkerAt(x, y);
});

window.addEventListener('resize', () => {
  if (state.currentDoc) placeMarkers();
});

function renderToolbarState() {
  saveStatus.textContent = state.saveEnabled ? state.saveStatus : 'Сохранение недоступно без локального API';
  undoButton.disabled = !state.editMode || state.undoStack.length === 0;
  redoButton.disabled = !state.editMode || state.redoStack.length === 0;
  saveButton.disabled = !state.saveEnabled;
  titleInput.disabled = !state.editMode;
  codeSelect.disabled = !state.editMode;
  deleteMarkerButton.disabled = !state.editMode || !getCurrentMarker();
  document.body.classList.toggle('edit-mode', state.editMode);
}

function renderDocList() {
  docList.innerHTML = '';
  for (const doc of state.filteredDocs) {
    const btn = document.createElement('button');
    btn.className = `doc-item${state.currentDoc?.id === doc.id ? ' active' : ''}`;
    btn.innerHTML = `
      <div class="doc-item-title">${escapeHtml(doc.title)}</div>
      <div class="doc-item-stats">стр. схемы ${doc.scheme_page} · меток ${doc.stats.matched_codes}/${doc.stats.total_codes}</div>
    `;
    btn.addEventListener('click', () => selectDocument(doc.id));
    docList.appendChild(btn);
  }
}

function selectDocument(docId) {
  state.currentDoc = state.catalog.documents.find((d) => d.id === docId) || null;
  state.currentMarkerId = null;
  state.selectedCode = '';
  renderDocList();
  renderDocument();
}

function renderDocument() {
  const doc = state.currentDoc;
  if (!doc) return;
  docTitle.textContent = doc.title;
  titleInput.value = doc.title;
  docMeta.textContent = `scheme_page: ${doc.scheme_page} · table_pages: ${doc.table_pages.join(', ') || '—'} · найдено меток: ${doc.stats.matched_codes}/${doc.stats.total_codes}`;
  schemeImage.src = doc.scheme_image;
  schemeImage.onload = () => {
    syncOverlaySize();
    placeMarkers();
  };
  syncOverlaySize();
  populateCodeSelect();
  renderSelection(null);
  renderMarkerEditor();
  renderUnmatched();
  renderToolbarState();
}

function syncOverlaySize() {
  overlay.style.width = `${schemeImage.clientWidth}px`;
  overlay.style.height = `${schemeImage.clientHeight}px`;
}

function placeMarkers() {
  const doc = state.currentDoc;
  if (!doc || !schemeImage.naturalWidth || !schemeImage.naturalHeight) return;
  overlay.innerHTML = '';
  const scaleX = schemeImage.clientWidth / schemeImage.naturalWidth;
  const scaleY = schemeImage.clientHeight / schemeImage.naturalHeight;
  for (const marker of doc.markers) {
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
      renderMarkerEditor();
      renderToolbarState();
      placeMarkers();
    });
    if (state.editMode) {
      enableDragAndResize(el, marker, scaleX, scaleY);
      const handle = document.createElement('span');
      handle.className = 'resize-handle';
      el.appendChild(handle);
    }
    overlay.appendChild(el);
  }
}

function renderSelection(marker) {
  if (!marker) {
    selectionTitle.textContent = 'Деталь не выбрана';
    selectionMeta.textContent = state.editMode ? 'Выберите метку или добавьте новую кликом по схеме' : 'Выберите красную метку на схеме';
    rowsContainer.innerHTML = '<div class="empty">После клика здесь появятся все строки таблицы для выбранного идентификатора.</div>';
    return;
  }
  selectionTitle.textContent = `Идентификатор ${marker.label}`;
  selectionMeta.textContent = `Код: ${marker.code} · источник: ${marker.match_method || 'manual'}`;
  const rows = marker.rows.map((row) => `
    <tr>
      <td><span class="badge">${escapeHtml(row.code)}</span></td>
      <td>${escapeHtml(row.part_number || '—')}</td>
      <td>${escapeHtml(row.name || '—')}</td>
      <td>${escapeHtml(row.qty || '—')}</td>
    </tr>
  `).join('');
  rowsContainer.innerHTML = `
    <table class="rows-table">
      <thead><tr><th>Код</th><th>Номер детали</th><th>Наименование</th><th>Кол-во</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderUnmatched() {
  const doc = state.currentDoc;
  if (!doc) return;
  const unmatched = doc.unmatched_codes || [];
  unmatchedContainer.innerHTML = `
    <div class="section-title">Нераспознанные коды: ${unmatched.length}</div>
    <div class="unmatched-grid">
      ${unmatched.map((item) => `
        <button class="unmatched-card${state.selectedCode === item.code ? ' selected' : ''}" data-code="${escapeHtml(item.code)}" ${state.editMode ? '' : 'disabled'}>
          <div><strong>${escapeHtml(item.label)}</strong></div>
          <div>${escapeHtml(item.rows[0]?.part_number || '—')}</div>
        </button>`).join('') || '<div class="empty">Нет нераспознанных кодов для этой схемы.</div>'}
    </div>
  `;
  unmatchedContainer.querySelectorAll('[data-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCode = btn.dataset.code;
      codeSelect.value = state.selectedCode;
      renderCodeSelectionMeta();
      renderUnmatched();
    });
  });
}

function populateCodeSelect() {
  const doc = state.currentDoc;
  const codes = buildCodeIndex(doc);
  codeSelect.innerHTML = '<option value="">Выберите код для новой метки</option>';
  for (const item of codes) {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = `${item.code} — ${item.rows[0]?.name || item.rows[0]?.part_number || 'без описания'}`;
    codeSelect.appendChild(option);
  }
  codeSelect.value = state.selectedCode;
  renderCodeSelectionMeta();
}

function renderCodeSelectionMeta() {
  if (!state.currentDoc || !state.selectedCode) {
    selectedCodeMeta.textContent = state.editMode ? 'Выберите код и кликните по схеме, чтобы добавить метку.' : 'Режим редактирования выключен.';
    return;
  }
  const entry = buildCodeIndex(state.currentDoc).find((item) => item.code === state.selectedCode);
  selectedCodeMeta.textContent = entry ? `${entry.rows.length} строк(и) · ${entry.rows[0]?.part_number || 'без номера детали'} · ${entry.source}` : 'Код не найден';
}

function renderMarkerEditor() {
  const marker = getCurrentMarker();
  if (!marker) {
    markerEditor.classList.add('is-empty');
    markerLabelInput.value = '';
    markerCodeInput.value = '';
    markerXInput.value = '';
    markerYInput.value = '';
    markerWInput.value = '';
    markerHInput.value = '';
    markerRowsPreview.innerHTML = '<div class="empty">Выберите метку для точной правки координат и размера.</div>';
    editorHint.textContent = state.editMode ? 'Можно перетаскивать метку мышью и тянуть за угол.' : 'Включите Edit mode для правок.';
    return;
  }
  markerEditor.classList.remove('is-empty');
  markerLabelInput.value = marker.label || '';
  markerCodeInput.value = marker.code || '';
  markerXInput.value = round(marker.rect.x);
  markerYInput.value = round(marker.rect.y);
  markerWInput.value = round(marker.rect.w);
  markerHInput.value = round(marker.rect.h);
  markerRowsPreview.innerHTML = marker.rows.map((row) => `<div>${escapeHtml(row.code)} · ${escapeHtml(row.part_number || '—')} · ${escapeHtml(row.name || '—')}</div>`).join('');
  editorHint.textContent = marker.match_method === 'manual' ? 'Ручная метка' : `Исходно: ${marker.match_method}`;
}

function updateMarkerFromForm() {
  const marker = getCurrentMarker();
  if (!marker || !state.editMode) return;
  const nextCode = markerCodeInput.value.trim();
  const entry = buildCodeIndex(state.currentDoc).find((item) => item.code === nextCode);
  marker.label = markerLabelInput.value.trim() || nextCode || marker.label;
  if (entry) {
    marker.code = entry.code;
    marker.rows = entry.rows;
  }
  marker.rect.x = numberOr(markerXInput.value, marker.rect.x);
  marker.rect.y = numberOr(markerYInput.value, marker.rect.y);
  marker.rect.w = Math.max(12, numberOr(markerWInput.value, marker.rect.w));
  marker.rect.h = Math.max(12, numberOr(markerHInput.value, marker.rect.h));
  upsertDocOverride();
  placeMarkers();
  renderSelection(marker);
  renderMarkerEditor();
}

function buildCodeIndex(doc) {
  const map = new Map();
  for (const marker of doc.markers || []) {
    if (!map.has(marker.code)) map.set(marker.code, { code: marker.code, label: marker.label, rows: marker.rows || [], source: 'уже на схеме' });
  }
  for (const item of doc.unmatched_codes || []) {
    if (!map.has(item.code)) map.set(item.code, { code: item.code, label: item.label, rows: item.rows || [], source: 'unmatched' });
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'ru'));
}

function addMarkerAt(viewX, viewY) {
  const doc = state.currentDoc;
  const entry = buildCodeIndex(doc).find((item) => item.code === state.selectedCode);
  if (!entry) return;
  snapshotHistory();
  const scaleX = schemeImage.naturalWidth / schemeImage.clientWidth;
  const scaleY = schemeImage.naturalHeight / schemeImage.clientHeight;
  const marker = {
    editor_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: entry.code,
    label: entry.label || entry.code,
    text: entry.label || entry.code,
    score: 1,
    match_method: 'manual',
    rect: {
      x: round(viewX * scaleX - 30),
      y: round(viewY * scaleY - 15),
      w: 60,
      h: 30,
    },
    rows: entry.rows,
  };
  doc.markers.push(marker);
  state.currentMarkerId = marker.editor_id;
  refreshCurrentDocData();
}

function refreshCurrentDocData() {
  upsertDocOverride();
  recalcDocStats(state.currentDoc);
  placeMarkers();
  renderSelection(getCurrentMarker());
  renderMarkerEditor();
  renderUnmatched();
  renderDocList();
  renderToolbarState();
  populateCodeSelect();
}

function enableDragAndResize(el, marker, scaleX, scaleY) {
  el.addEventListener('pointerdown', (event) => {
    if (!state.editMode) return;
    event.preventDefault();
    event.stopPropagation();
    state.currentMarkerId = marker.editor_id;
    const isResize = event.target.classList.contains('resize-handle');
    state.dragState = {
      type: isResize ? 'resize' : 'move',
      marker,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...marker.rect },
      scaleX,
      scaleY,
    };
    renderSelection(marker);
    renderMarkerEditor();
    renderToolbarState();
    placeMarkers();
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  });
}

function onPointerMove(event) {
  if (!state.dragState) return;
  const { marker, startX, startY, startRect, scaleX, scaleY, type } = state.dragState;
  const dx = (event.clientX - startX) / scaleX;
  const dy = (event.clientY - startY) / scaleY;
  if (type === 'move') {
    marker.rect.x = clamp(round(startRect.x + dx), 0, state.currentDoc.image_size.width - marker.rect.w);
    marker.rect.y = clamp(round(startRect.y + dy), 0, state.currentDoc.image_size.height - marker.rect.h);
  } else {
    marker.rect.w = Math.max(12, round(startRect.w + dx));
    marker.rect.h = Math.max(12, round(startRect.h + dy));
  }
  upsertDocOverride();
  placeMarkers();
  renderMarkerEditor();
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove);
  state.dragState = null;
  renderToolbarState();
}

function getCurrentMarker() {
  return state.currentDoc?.markers.find((item) => item.editor_id === state.currentMarkerId) || null;
}

function upsertDocOverride() {
  if (!state.currentDoc) return;
  state.overrides.documents[state.currentDoc.id] = {
    title: state.currentDoc.title,
    markers: state.currentDoc.markers,
  };
  state.saveStatus = 'Есть несохранённые изменения';
}

function snapshotHistory() {
  if (!state.editMode || !state.currentDoc || state.restoringHistory) return;
  const doc = state.currentDoc;
  state.undoStack.push(JSON.stringify({
    docId: doc.id,
    title: doc.title,
    markers: structuredClone(doc.markers || []),
    currentMarkerId: state.currentMarkerId,
  }));
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack = [];
  renderToolbarState();
}

function applyHistorySnapshot(raw) {
  if (!raw) return;
  const snap = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const doc = state.catalog.documents.find((d) => d.id === snap.docId);
  if (!doc) return;
  state.restoringHistory = true;
  state.currentDoc = doc;
  doc.title = snap.title;
  doc.markers = (snap.markers || []).map(ensureMarkerId);
  state.currentMarkerId = snap.currentMarkerId || null;
  refreshCurrentDocData();
  titleInput.value = doc.title;
  state.restoringHistory = false;
}

function undoChange() {
  if (!state.undoStack.length || !state.currentDoc) return;
  const current = JSON.stringify({
    docId: state.currentDoc.id,
    title: state.currentDoc.title,
    markers: structuredClone(state.currentDoc.markers || []),
    currentMarkerId: state.currentMarkerId,
  });
  state.redoStack.push(current);
  const prev = state.undoStack.pop();
  applyHistorySnapshot(prev);
  renderToolbarState();
}

function redoChange() {
  if (!state.redoStack.length || !state.currentDoc) return;
  const current = JSON.stringify({
    docId: state.currentDoc.id,
    title: state.currentDoc.title,
    markers: structuredClone(state.currentDoc.markers || []),
    currentMarkerId: state.currentMarkerId,
  });
  state.undoStack.push(current);
  const next = state.redoStack.pop();
  applyHistorySnapshot(next);
  renderToolbarState();
}

async function saveOverrides() {
  if (!state.saveEnabled) return;
  saveButton.disabled = true;
  state.saveStatus = 'Сохраняем...';
  renderToolbarState();
  try {
    const response = await fetch('api/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.overrides, null, 2),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.saveStatus = 'Сохранено в data/overrides.json';
    state.redoStack = [];
  } catch (err) {
    state.saveStatus = 'Ошибка сохранения';
    console.error(err);
  } finally {
    saveButton.disabled = false;
    renderToolbarState();
  }
}

function normalizeOverrides(overrides) {
  return overrides && typeof overrides === 'object' && typeof overrides.documents === 'object'
    ? overrides
    : { documents: {} };
}

function mergeCatalogWithOverrides(catalog, overrides) {
  const merged = structuredClone(catalog);
  for (const doc of merged.documents) {
    const docOverride = overrides.documents[doc.id];
    doc.markers = (doc.markers || []).map(ensureMarkerId);
    if (!docOverride) continue;
    if (typeof docOverride.title === 'string') doc.title = docOverride.title;
    if (Array.isArray(docOverride.markers)) doc.markers = docOverride.markers.map(ensureMarkerId);
    recalcDocStats(doc);
  }
  return merged;
}

function ensureMarkerId(marker) {
  if (marker.editor_id) return marker;
  return { ...marker, editor_id: `${marker.code}-${round(marker.rect?.x || 0)}-${round(marker.rect?.y || 0)}` };
}

function recalcDocStats(doc) {
  const matched = new Set((doc.markers || []).map((marker) => marker.code));
  doc.stats = {
    ...doc.stats,
    total_codes: matched.size + (doc.unmatched_codes || []).length,
    matched_codes: matched.size,
    unmatched_codes: (doc.unmatched_codes || []).length,
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
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
