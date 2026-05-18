import { initCatalogApp } from '../shared/catalog-app.js';

const state = {
  editMode: false,
  selectedCode: '',
  saveEnabled: false,
  saveStatus: 'Только просмотр',
  dragState: null,
  draggedDocId: null,
  undoStack: [],
  redoStack: [],
  restoringHistory: false,
};

const els = {
  editToggleButton: document.getElementById('editToggleButton'),
  undoButton: document.getElementById('undoButton'),
  redoButton: document.getElementById('redoButton'),
  saveButton: document.getElementById('saveButton'),
  saveStatus: document.getElementById('saveStatus'),
  titleInput: document.getElementById('titleInput'),
  codeSelect: document.getElementById('codeSelect'),
  categorySelect: document.getElementById('categorySelect'),
  categoryNameInput: document.getElementById('categoryNameInput'),
  addCategoryButton: document.getElementById('addCategoryButton'),
  manageCategorySelect: document.getElementById('manageCategorySelect'),
  renameCategoryButton: document.getElementById('renameCategoryButton'),
  deleteCategoryButton: document.getElementById('deleteCategoryButton'),
  selectedCodeMeta: document.getElementById('selectedCodeMeta'),
  deleteMarkerButton: document.getElementById('deleteMarkerButton'),
  editorHint: document.getElementById('editorHint'),
  markerEditor: document.getElementById('markerEditor'),
  markerLabelInput: document.getElementById('markerLabelInput'),
  markerCodeInput: document.getElementById('markerCodeInput'),
  markerXInput: document.getElementById('markerXInput'),
  markerYInput: document.getElementById('markerYInput'),
  markerWInput: document.getElementById('markerWInput'),
  markerHInput: document.getElementById('markerHInput'),
  overlay: document.getElementById('overlay'),
  schemeImage: document.getElementById('schemeImage'),
};

const app = initCatalogApp({
  readonly: false,
  onVariantLoaded: () => {
    state.saveEnabled = true;
    state.saveStatus = 'Готово к редактированию';
    resetEditorTransientState();
    renderCategoryControls();
    renderToolbarState();
  },
  onDocumentSelected: () => {
    populateCodeSelect();
    renderMarkerEditor();
    renderCodeSelectionMeta();
    renderEditableRows();
    renderCategoryControls();
    renderToolbarState();
  },
  onDocumentRendered: () => {
    if (app.state.currentDoc) {
      els.titleInput.value = app.state.currentDoc.title;
    }
    populateCodeSelect();
    renderMarkerEditor();
    renderCodeSelectionMeta();
    renderEditableRows();
    renderCategoryControls();
    renderToolbarState();
  },
  onMarkerSelected: () => {
    renderMarkerEditor();
    renderEditableRows();
    renderToolbarState();
  },
  onUnmatchedRendered: () => {
    bindUnmatchedSelection();
  },
  decorateMarker: (el, marker, ctx) => {
    if (!state.editMode) return;
    enableDragAndResize(el, marker, ctx.scaleX, ctx.scaleY);
    const handle = document.createElement('span');
    handle.className = 'resize-handle';
    el.appendChild(handle);
  },
  decorateCategoryHeader: (header, group) => {
    if (!state.editMode || group.id === '__uncategorized__') return;
    enableCategoryDrop(header, group.id);
  },
  decorateDocItem: (btn, doc, group) => {
    if (!state.editMode) return;
    enableDocDrag(btn, doc.id);
    enableCategoryDrop(btn, group.id);
  },
});

bindEditorEvents();

function bindEditorEvents() {
  els.editToggleButton.addEventListener('click', () => {
    state.editMode = !state.editMode;
    renderToolbarState();
    app.helpers.renderMarkers();
    app.helpers.renderUnmatched();
    renderMarkerEditor();
    renderCodeSelectionMeta();
    renderEditableRows();
    renderCategoryControls();
  });

  els.undoButton.addEventListener('click', undoChange);
  els.redoButton.addEventListener('click', redoChange);
  els.saveButton.addEventListener('click', saveOverrides);

  els.titleInput.addEventListener('focus', snapshotHistory);
  els.titleInput.addEventListener('input', () => {
    if (!app.state.currentDoc) return;
    app.state.currentDoc.title = els.titleInput.value;
    upsertDocOverride();
    app.helpers.renderDocList();
    app.elements.docTitle.textContent = app.state.currentDoc.title;
    renderToolbarState();
  });

  els.codeSelect.addEventListener('change', () => {
    state.selectedCode = els.codeSelect.value;
    renderCodeSelectionMeta();
    app.helpers.renderUnmatched();
  });

  els.categorySelect.addEventListener('change', () => {
    assignCurrentDocToCategory(els.categorySelect.value);
  });

  els.manageCategorySelect.addEventListener('change', () => {
    renderToolbarState();
  });

  els.addCategoryButton.addEventListener('click', addCategory);
  els.renameCategoryButton.addEventListener('click', renameCategory);
  els.deleteCategoryButton.addEventListener('click', deleteCategory);

  els.deleteMarkerButton.addEventListener('click', () => {
    const marker = app.helpers.getCurrentMarker();
    if (!marker || !app.state.currentDoc) return;
    snapshotHistory();
    app.state.currentDoc.markers = app.state.currentDoc.markers.filter((item) => item.editor_id !== marker.editor_id);
    app.state.currentMarkerId = null;
    refreshCurrentDocData();
  });

  for (const input of [els.markerLabelInput, els.markerCodeInput, els.markerXInput, els.markerYInput, els.markerWInput, els.markerHInput]) {
    input.addEventListener('focus', snapshotHistory);
    input.addEventListener('input', updateMarkerFromForm);
  }

  els.overlay.addEventListener('click', (event) => {
    if (!state.editMode || !state.selectedCode || event.target !== els.overlay) return;
    const rect = els.overlay.getBoundingClientRect();
    const x = app.helpers.clamp(event.clientX - rect.left, 0, rect.width);
    const y = app.helpers.clamp(event.clientY - rect.top, 0, rect.height);
    addMarkerAt(x, y);
  });
}

function resetEditorTransientState() {
  state.selectedCode = '';
  state.undoStack = [];
  state.redoStack = [];
  state.dragState = null;
  state.draggedDocId = null;
  app.state.currentMarkerId = null;
}

function renderToolbarState() {
  els.saveStatus.textContent = state.saveEnabled ? state.saveStatus : 'Сохранение недоступно без локального API';
  els.undoButton.disabled = !state.editMode || state.undoStack.length === 0;
  els.redoButton.disabled = !state.editMode || state.redoStack.length === 0;
  els.saveButton.disabled = !state.saveEnabled;
  els.titleInput.disabled = !state.editMode;
  els.codeSelect.disabled = !state.editMode;
  els.categorySelect.disabled = !state.editMode;
  els.addCategoryButton.disabled = !state.editMode;
  els.categoryNameInput.disabled = !state.editMode;
  els.manageCategorySelect.disabled = !state.editMode;
  els.renameCategoryButton.disabled = !state.editMode || !els.manageCategorySelect.value;
  els.deleteCategoryButton.disabled = !state.editMode || !els.manageCategorySelect.value;
  els.deleteMarkerButton.disabled = !state.editMode || !app.helpers.getCurrentMarker();
  els.editToggleButton.setAttribute('aria-pressed', state.editMode ? 'true' : 'false');
  els.editToggleButton.classList.toggle('is-active', state.editMode);
  els.editToggleButton.textContent = state.editMode ? 'Режим редактирования: активен' : 'Режим редактирования';
  document.body.classList.toggle('edit-mode', state.editMode);
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

function populateCodeSelect() {
  const doc = app.state.currentDoc;
  els.codeSelect.innerHTML = '<option value="">Выберите код для новой метки</option>';
  if (!doc) return;
  const codes = buildCodeIndex(doc);
  for (const item of codes) {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = `${item.code} — ${item.rows[0]?.name || item.rows[0]?.part_number || 'без описания'}`;
    els.codeSelect.appendChild(option);
  }
  els.codeSelect.value = state.selectedCode;
}

function bindUnmatchedSelection() {
  app.elements.unmatchedContainer.querySelectorAll('[data-code]').forEach((btn) => {
    btn.classList.toggle('selected', state.selectedCode === btn.dataset.code);
    btn.addEventListener('click', () => {
      state.selectedCode = btn.dataset.code;
      els.codeSelect.value = state.selectedCode;
      renderCodeSelectionMeta();
      app.helpers.renderUnmatched();
    });
  });
}

function renderCodeSelectionMeta() {
  if (!app.state.currentDoc || !state.selectedCode) {
    els.selectedCodeMeta.textContent = state.editMode ? 'Выберите код и кликните по схеме, чтобы добавить метку.' : 'Режим редактирования выключен.';
    return;
  }
  const entry = buildCodeIndex(app.state.currentDoc).find((item) => item.code === state.selectedCode);
  els.selectedCodeMeta.textContent = entry ? `${entry.rows.length} строк(и) · ${entry.rows[0]?.part_number || 'без номера детали'} · ${entry.source}` : 'Код не найден';
}

function renderEditableRows() {
  const marker = app.helpers.getCurrentMarker();
  const table = app.elements.rowsContainer.querySelector('.rows-table');
  if (!table || !marker) return;

  if (!state.editMode) {
    return;
  }

  const rows = table.querySelectorAll('tbody tr');
  rows.forEach((tr, index) => {
    const row = marker.rows?.[index];
    if (!row) return;
    const cells = tr.querySelectorAll('td');
    if (cells.length < 4) return;

    cells[1].innerHTML = `<input class="table-edit-input" data-row-index="${index}" data-field="part_number" type="text" value="${app.helpers.escapeHtml(row.part_number || '')}" />`;
    cells[2].innerHTML = `<input class="table-edit-input" data-row-index="${index}" data-field="name" type="text" value="${app.helpers.escapeHtml(row.name || '')}" />`;
    cells[3].innerHTML = `<input class="table-edit-input" data-row-index="${index}" data-field="qty" type="text" value="${app.helpers.escapeHtml(row.qty || '')}" />`;
  });

  table.querySelectorAll('.table-edit-input').forEach((input) => {
    input.addEventListener('focus', snapshotHistory);
    input.addEventListener('input', updateTableRowField);
  });
}

function updateTableRowField(event) {
  const marker = app.helpers.getCurrentMarker();
  if (!marker || !state.editMode) return;
  const input = event.target;
  const rowIndex = Number(input.dataset.rowIndex);
  const field = input.dataset.field;
  const row = marker.rows?.[rowIndex];
  if (!row || !field) return;
  row[field] = input.value;
  upsertDocOverride();
  state.saveStatus = 'Есть несохранённые изменения';
  renderToolbarState();
}

function renderMarkerEditor() {
  const marker = app.helpers.getCurrentMarker();
  if (!marker) {
    els.markerEditor.classList.add('is-empty');
    els.markerLabelInput.value = '';
    els.markerCodeInput.value = '';
    els.markerXInput.value = '';
    els.markerYInput.value = '';
    els.markerWInput.value = '';
    els.markerHInput.value = '';
    document.getElementById('markerRowsPreview').innerHTML = '<div class="empty">Выберите метку для точной правки координат и размера.</div>';
    els.editorHint.textContent = state.editMode ? 'Можно перетаскивать метку мышью и тянуть за угол.' : 'Включите режим редактирования для правок.';
    return;
  }
  els.markerEditor.classList.remove('is-empty');
  els.markerLabelInput.value = marker.label || '';
  els.markerCodeInput.value = marker.code || '';
  els.markerXInput.value = app.helpers.round(marker.rect.x);
  els.markerYInput.value = app.helpers.round(marker.rect.y);
  els.markerWInput.value = app.helpers.round(marker.rect.w);
  els.markerHInput.value = app.helpers.round(marker.rect.h);
  document.getElementById('markerRowsPreview').innerHTML = marker.rows.map((row) => `<div>${app.helpers.escapeHtml(row.code)} · ${app.helpers.escapeHtml(row.part_number || '—')} · ${app.helpers.escapeHtml(row.name || '—')}</div>`).join('');
  els.editorHint.textContent = marker.match_method === 'manual' ? 'Ручная метка' : `Исходно: ${marker.match_method}`;
}

function updateMarkerFromForm() {
  const marker = app.helpers.getCurrentMarker();
  if (!marker || !state.editMode) return;
  const nextCode = els.markerCodeInput.value.trim();
  const entry = buildCodeIndex(app.state.currentDoc).find((item) => item.code === nextCode);
  marker.label = els.markerLabelInput.value.trim() || nextCode || marker.label;
  if (entry) {
    marker.code = entry.code;
    marker.rows = entry.rows;
  }
  marker.rect.x = app.helpers.numberOr(els.markerXInput.value, marker.rect.x);
  marker.rect.y = app.helpers.numberOr(els.markerYInput.value, marker.rect.y);
  marker.rect.w = Math.max(12, app.helpers.numberOr(els.markerWInput.value, marker.rect.w));
  marker.rect.h = Math.max(12, app.helpers.numberOr(els.markerHInput.value, marker.rect.h));
  upsertDocOverride();
  app.helpers.renderMarkers();
  app.helpers.renderSelection(marker);
  renderEditableRows();
  renderMarkerEditor();
}

function addMarkerAt(viewX, viewY) {
  const doc = app.state.currentDoc;
  const entry = buildCodeIndex(doc).find((item) => item.code === state.selectedCode);
  if (!entry) return;
  snapshotHistory();
  const scaleX = els.schemeImage.naturalWidth / els.schemeImage.clientWidth;
  const scaleY = els.schemeImage.naturalHeight / els.schemeImage.clientHeight;
  const marker = {
    editor_id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    code: entry.code,
    label: entry.label || entry.code,
    text: entry.label || entry.code,
    score: 1,
    match_method: 'manual',
    rect: {
      x: app.helpers.round(viewX * scaleX - 30),
      y: app.helpers.round(viewY * scaleY - 15),
      w: 60,
      h: 30,
    },
    rows: entry.rows,
  };
  doc.markers.push(marker);
  app.state.currentMarkerId = marker.editor_id;
  refreshCurrentDocData();
}

function refreshCurrentDocData() {
  upsertDocOverride();
  app.helpers.recalcDocStats(app.state.currentDoc);
  app.helpers.renderMarkers();
  app.helpers.renderSelection(app.helpers.getCurrentMarker());
  renderEditableRows();
  renderMarkerEditor();
  app.helpers.renderUnmatched();
  app.helpers.renderDocList();
  renderCategoryControls();
  renderToolbarState();
  populateCodeSelect();
}

function enableDragAndResize(el, marker, scaleX, scaleY) {
  el.addEventListener('pointerdown', (event) => {
    if (!state.editMode) return;
    event.preventDefault();
    event.stopPropagation();
    app.state.currentMarkerId = marker.editor_id;
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
    app.helpers.renderSelection(marker);
    renderMarkerEditor();
    renderToolbarState();
    app.helpers.renderMarkers();
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
    marker.rect.x = app.helpers.clamp(app.helpers.round(startRect.x + dx), 0, app.state.currentDoc.image_size.width - marker.rect.w);
    marker.rect.y = app.helpers.clamp(app.helpers.round(startRect.y + dy), 0, app.state.currentDoc.image_size.height - marker.rect.h);
  } else {
    marker.rect.w = Math.max(12, app.helpers.round(startRect.w + dx));
    marker.rect.h = Math.max(12, app.helpers.round(startRect.h + dy));
  }
  upsertDocOverride();
  app.helpers.renderMarkers();
  renderMarkerEditor();
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove);
  state.dragState = null;
  renderToolbarState();
}

function enableDocDrag(el, docId) {
  el.draggable = true;
  el.addEventListener('dragstart', (event) => {
    state.draggedDocId = docId;
    el.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', docId);
  });
  el.addEventListener('dragend', () => {
    state.draggedDocId = null;
    el.classList.remove('dragging');
    clearDropTargets();
  });
}

function enableCategoryDrop(el, categoryId) {
  el.addEventListener('dragover', (event) => {
    if (!state.editMode || !state.draggedDocId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    el.classList.add('drop-target');
  });
  el.addEventListener('dragleave', () => {
    el.classList.remove('drop-target');
  });
  el.addEventListener('drop', (event) => {
    if (!state.editMode || !state.draggedDocId) return;
    event.preventDefault();
    el.classList.remove('drop-target');
    moveDocToCategory(state.draggedDocId, categoryId === '__uncategorized__' ? '' : categoryId);
  });
}

function clearDropTargets() {
  document.querySelectorAll('.drop-target').forEach((item) => item.classList.remove('drop-target'));
}

function moveDocToCategory(docId, categoryId) {
  if (!docId) return;
  snapshotHistory();
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  for (const category of categories) {
    category.docIds = (category.docIds || []).filter((item) => item !== docId);
  }
  if (categoryId) {
    const target = categories.find((item) => item.id === categoryId);
    if (target) {
      target.docIds = target.docIds || [];
      if (!target.docIds.includes(docId)) target.docIds.push(docId);
    }
  }
  app.state.catalog.categories = categories;
  app.state.overrides.categories = structuredClone(categories);
  state.saveStatus = 'Есть несохранённые изменения';
  app.helpers.renderDocList();
  renderCategoryControls();
  renderToolbarState();
}

function rowsByMarkerSnapshot(doc) {
  return (doc.markers || []).map((marker) => structuredClone(marker.rows || []));
}

function renderCategoryControls() {
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  const currentCategoryId = findCategoryForDoc(app.state.currentDoc?.id);
  els.categorySelect.innerHTML = '<option value="">Без категории</option>';
  els.manageCategorySelect.innerHTML = '<option value="">Выберите категорию</option>';
  for (const category of categories) {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.title || category.id;
    option.selected = category.id === currentCategoryId;
    els.categorySelect.appendChild(option);

    const manageOption = document.createElement('option');
    manageOption.value = category.id;
    manageOption.textContent = category.title || category.id;
    els.manageCategorySelect.appendChild(manageOption);
  }
}

function findCategoryForDoc(docId) {
  if (!docId) return '';
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  for (const category of categories) {
    if ((category.docIds || []).includes(docId)) return category.id;
  }
  return '';
}

function addCategory() {
  if (!state.editMode) return;
  const title = els.categoryNameInput.value.trim();
  if (!title) return;
  snapshotHistory();
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  const id = title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '_').replace(/^_+|_+$/g, '') || `category_${Date.now()}`;
  if (categories.find((item) => item.id === id)) {
    els.categoryNameInput.value = '';
    return;
  }
  categories.push({ id, title, docIds: [] });
  app.state.catalog.categories = categories;
  app.state.overrides.categories = structuredClone(categories);
  els.categoryNameInput.value = '';
  state.saveStatus = 'Есть несохранённые изменения';
  renderCategoryControls();
  app.helpers.renderDocList();
  renderToolbarState();
}

function renameCategory() {
  if (!state.editMode) return;
  const categoryId = els.manageCategorySelect.value;
  if (!categoryId) return;
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return;
  const nextTitle = window.prompt('Новое название категории', category.title || category.id);
  if (!nextTitle) return;
  snapshotHistory();
  category.title = nextTitle.trim() || category.title;
  app.state.overrides.categories = structuredClone(categories);
  state.saveStatus = 'Есть несохранённые изменения';
  app.helpers.renderDocList();
  renderCategoryControls();
  renderToolbarState();
}

function deleteCategory() {
  if (!state.editMode) return;
  const categoryId = els.manageCategorySelect.value;
  if (!categoryId) return;
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  const category = categories.find((item) => item.id === categoryId);
  if (!category) return;
  const confirmed = window.confirm(`Удалить категорию "${category.title || category.id}"? Схемы останутся без категории.`);
  if (!confirmed) return;
  snapshotHistory();
  app.state.catalog.categories = categories.filter((item) => item.id !== categoryId);
  app.state.overrides.categories = structuredClone(app.state.catalog.categories);
  els.manageCategorySelect.value = '';
  state.saveStatus = 'Есть несохранённые изменения';
  app.helpers.renderDocList();
  renderCategoryControls();
  renderToolbarState();
}

function assignCurrentDocToCategory(categoryId) {
  if (!state.editMode || !app.state.currentDoc) return;
  snapshotHistory();
  const docId = app.state.currentDoc.id;
  const categories = Array.isArray(app.state.catalog?.categories) ? app.state.catalog.categories : [];
  for (const category of categories) {
    category.docIds = (category.docIds || []).filter((item) => item !== docId);
  }
  if (categoryId) {
    const target = categories.find((item) => item.id === categoryId);
    if (target) {
      target.docIds = target.docIds || [];
      if (!target.docIds.includes(docId)) target.docIds.push(docId);
    }
  }
  app.state.catalog.categories = categories;
  app.state.overrides.categories = structuredClone(categories);
  state.saveStatus = 'Есть несохранённые изменения';
  app.helpers.renderDocList();
  renderCategoryControls();
  renderToolbarState();
}

function upsertDocOverride() {
  if (!app.state.currentDoc) return;
  app.state.overrides.documents[app.state.currentDoc.id] = {
    title: app.state.currentDoc.title,
    markers: app.state.currentDoc.markers,
    rowsByMarker: rowsByMarkerSnapshot(app.state.currentDoc),
  };
  app.state.overrides.categories = structuredClone(app.state.catalog?.categories || []);
  state.saveStatus = 'Есть несохранённые изменения';
}

function snapshotHistory() {
  if (!state.editMode || !app.state.currentDoc || state.restoringHistory) return;
  const doc = app.state.currentDoc;
  state.undoStack.push(JSON.stringify({
    docId: doc.id,
    title: doc.title,
    markers: structuredClone(doc.markers || []),
    categories: structuredClone(app.state.catalog?.categories || []),
    currentMarkerId: app.state.currentMarkerId,
  }));
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack = [];
  renderToolbarState();
}

function applyHistorySnapshot(raw) {
  if (!raw) return;
  const snap = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const doc = app.state.catalog.documents.find((d) => d.id === snap.docId);
  if (!doc) return;
  state.restoringHistory = true;
  app.state.currentDoc = doc;
  doc.title = snap.title;
  doc.markers = (snap.markers || []).map(app.helpers.ensureMarkerId);
  app.state.catalog.categories = structuredClone(snap.categories || []);
  app.state.overrides.categories = structuredClone(snap.categories || []);
  app.state.currentMarkerId = snap.currentMarkerId || null;
  refreshCurrentDocData();
  els.titleInput.value = doc.title;
  state.restoringHistory = false;
}

function undoChange() {
  if (!state.undoStack.length || !app.state.currentDoc) return;
  const current = JSON.stringify({
    docId: app.state.currentDoc.id,
    title: app.state.currentDoc.title,
    markers: structuredClone(app.state.currentDoc.markers || []),
    categories: structuredClone(app.state.catalog?.categories || []),
    currentMarkerId: app.state.currentMarkerId,
  });
  state.redoStack.push(current);
  const prev = state.undoStack.pop();
  applyHistorySnapshot(prev);
  renderToolbarState();
}

function redoChange() {
  if (!state.redoStack.length || !app.state.currentDoc) return;
  const current = JSON.stringify({
    docId: app.state.currentDoc.id,
    title: app.state.currentDoc.title,
    markers: structuredClone(app.state.currentDoc.markers || []),
    categories: structuredClone(app.state.catalog?.categories || []),
    currentMarkerId: app.state.currentMarkerId,
  });
  state.undoStack.push(current);
  const next = state.redoStack.pop();
  applyHistorySnapshot(next);
  renderToolbarState();
}

async function saveOverrides() {
  if (!state.saveEnabled || !app.state.currentVariant) return;
  els.saveButton.disabled = true;
  state.saveStatus = 'Сохраняем...';
  renderToolbarState();
  try {
    const response = await fetch(`api/overrides?variant=${encodeURIComponent(app.state.currentVariant.id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(app.state.overrides, null, 2),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.saveStatus = `Сохранено в ${app.state.currentVariant.overridesPath || 'overrides'}`;
    state.redoStack = [];
  } catch (err) {
    state.saveStatus = 'Ошибка сохранения';
    console.error(err);
  } finally {
    els.saveButton.disabled = false;
    renderToolbarState();
  }
}
