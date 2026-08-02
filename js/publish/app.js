import { initCatalogApp } from '../shared/catalog-app.js';

initCatalogApp({
  readonly: true,
  onDocumentRendered: ({ elements }) => {
    if (elements.saveStatus) {
      elements.saveStatus.textContent = 'Read-only publish version';
    }
  },
});
