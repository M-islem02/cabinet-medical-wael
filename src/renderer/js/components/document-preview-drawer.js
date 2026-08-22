/**
 * Document Preview Drawer - WYSIWYG Document Editor & Printer
 * Provides a slide-out drawer with real paper dimensions for previewing
 * and editing documents before printing.
 *
 * Usage:
 *   DocumentPreview.open({
 *     type: 'ordonnance',
 *     title: 'Ordonnance - Patient Name',
 *     format: 'A5',
 *     content: '<html content>',
 *     editable: true,
 *     doctorInfo: { name, specialty, address, phone, license },
 *     patientInfo: { name, age, phone },
 *     onSave: (content) => {},
 *     onPrint: () => {},
 *   });
 *   DocumentPreview.close();
 *   DocumentPreview.getContent();
 */
(function() {
  'use strict';

  const PAGE_SIZES = {
    A4: { width: 794, height: 1123, cssWidth: '794px', cssMinHeight: '1123px', margin: '15mm' },
    A5: { width: 559, height: 794, cssWidth: '559px', cssMinHeight: '794px', margin: '10mm' },
  };

  const DEFAULT_FORMATS = {
    ordonnance: 'A5',
    certificat: 'A5',
    arret: 'A5',
    facture: 'A5',
    rapport: 'A4',
    orientation: 'A4',
    svp: 'A4',
  };

  let currentInstance = null;

  const DocumentPreview = {
    open(options = {}) {
      // Close any existing drawer
      DocumentPreview.close();

      const config = {
        type: options.type || 'ordonnance',
        title: options.title || 'Aperçu du document',
        format: options.format || DEFAULT_FORMATS[options.type] || 'A4',
        content: options.content || '',
        editable: options.editable !== false,
        doctorInfo: options.doctorInfo || {},
        patientInfo: options.patientInfo || {},
        onSave: options.onSave || null,
        onPrint: options.onPrint || null,
        date: options.date || new Date().toLocaleDateString('fr-FR'),
      };

      // Create mask
      const mask = document.createElement('div');
      mask.className = 'ant-drawer-mask';
      mask.addEventListener('click', () => DocumentPreview.close());

      // Create drawer
      const size = PAGE_SIZES[config.format];
      const drawerWidth = Math.max(size.width + 96, 650); // paper + padding

      const drawer = document.createElement('div');
      drawer.className = 'ant-drawer';
      drawer.id = 'document-preview-drawer';
      drawer.style.width = drawerWidth + 'px';

      // Header
      const header = document.createElement('div');
      header.className = 'ant-drawer-header';
      header.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="ant-drawer-title">${config.title}</span>
        </div>
        <div class="ant-drawer-extra">
          <div id="doc-format-toggle" style="margin-right:8px;"></div>
          <button class="btn" id="doc-save-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Enregistrer
          </button>
          <button class="btn btn-primary" id="doc-print-btn">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimer
          </button>
          <button class="ant-drawer-close" id="doc-close-btn">×</button>
        </div>
      `;

      // Body
      const body = document.createElement('div');
      body.className = 'ant-drawer-body';
      body.style.background = '#f5f5f5';
      body.style.display = 'flex';
      body.style.justifyContent = 'center';
      body.style.paddingTop = '24px';

      // Paper canvas
      const canvas = document.createElement('div');
      canvas.className = 'doc-canvas doc-canvas-' + config.format.toLowerCase();
      canvas.id = 'doc-canvas';

      // Build document content
      let docHtml = '';

      // Doctor header
      if (config.doctorInfo && config.doctorInfo.name) {
        docHtml += `<div class="doc-header">
          <div>
            <div style="font-size:16px;font-weight:700;color:rgba(0,0,0,0.88);">${config.doctorInfo.name}</div>
            <div style="font-size:13px;color:rgba(0,0,0,0.45);">${config.doctorInfo.specialty || 'Médecin ORL'}</div>
            <div style="font-size:12px;color:rgba(0,0,0,0.45);margin-top:4px;">${config.doctorInfo.address || ''}</div>
            <div style="font-size:12px;color:rgba(0,0,0,0.45);">${config.doctorInfo.phone || ''}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:13px;color:rgba(0,0,0,0.45);">Date: ${config.date}</div>
            ${config.doctorInfo.license ? '<div style="font-size:11px;color:rgba(0,0,0,0.25);margin-top:4px;">N° ' + config.doctorInfo.license + '</div>' : ''}
          </div>
        </div>`;
      }

      // Patient info bar
      if (config.patientInfo && config.patientInfo.name) {
        docHtml += `<div style="background:#f6ffed;border:1px solid #b7eb8f;border-radius:6px;padding:10px 16px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
          <div><strong>Patient :</strong> ${config.patientInfo.name}</div>
          ${config.patientInfo.age ? '<div>Age : ' + config.patientInfo.age + '</div>' : ''}
          ${config.patientInfo.phone ? '<div>Tél : ' + config.patientInfo.phone + '</div>' : ''}
        </div>`;
      }

      // Document type title
      const typeLabels = {
        ordonnance: 'ORDONNANCE MÉDICALE',
        certificat: 'CERTIFICAT MÉDICAL',
        arret: 'CERTIFICAT D\'ARRÊT DE TRAVAIL',
        facture: 'FACTURE',
        rapport: 'RAPPORT MÉDICAL',
        orientation: 'LETTRE D\'ORIENTATION',
        svp: 'BON POUR',
      };
      docHtml += `<div class="doc-title">${typeLabels[config.type] || config.title}</div>`;

      // Main content
      docHtml += `<div id="doc-editable-content" ${config.editable ? 'contenteditable="true"' : ''} style="min-height:200px;outline:none;font-size:14px;line-height:1.8;">${config.content || '<p>Contenu du document...</p>'}</div>`;

      // Signature block
      docHtml += `<div style="margin-top:60px;text-align:right;">
        <div style="font-size:13px;color:rgba(0,0,0,0.45);">Signature & Cachet</div>
        <div style="margin-top:40px;border-top:1px solid #d9d9d9;display:inline-block;min-width:200px;"></div>
      </div>`;

      canvas.innerHTML = docHtml;
      body.appendChild(canvas);

      // Assemble drawer
      drawer.appendChild(header);
      drawer.appendChild(body);

      document.body.appendChild(mask);
      document.body.appendChild(drawer);

      // Initialize format toggle
      const formatToggle = document.getElementById('doc-format-toggle');
      if (formatToggle && typeof AntSegmented !== 'undefined') {
        AntSegmented.create(formatToggle, {
          options: [
            { label: 'A4', value: 'A4' },
            { label: 'A5', value: 'A5' },
          ],
          defaultValue: config.format,
          onChange: (value) => DocumentPreview._switchFormat(value),
        });
      }

      // Event listeners
      document.getElementById('doc-close-btn').addEventListener('click', () => DocumentPreview.close());
      document.getElementById('doc-print-btn').addEventListener('click', () => DocumentPreview.print());
      document.getElementById('doc-save-btn').addEventListener('click', () => {
        if (config.onSave) {
          config.onSave(DocumentPreview.getContent());
        }
        if (typeof showNotification === 'function') {
          showNotification('Document enregistré avec succès', 'success');
        }
      });

      // Escape key
      const escHandler = (e) => {
        if (e.key === 'Escape') DocumentPreview.close();
      };
      document.addEventListener('keydown', escHandler);

      currentInstance = { mask, drawer, config, escHandler };

      // Animate in
      requestAnimationFrame(() => {
        drawer.style.transform = 'translateX(0)';
      });
    },

    close() {
      if (!currentInstance) return;
      const { mask, drawer, escHandler } = currentInstance;
      document.removeEventListener('keydown', escHandler);
      drawer.style.transform = 'translateX(100%)';
      setTimeout(() => {
        mask.remove();
        drawer.remove();
        currentInstance = null;
      }, 300);
    },

    getContent() {
      const editable = document.getElementById('doc-editable-content');
      return editable ? editable.innerHTML : '';
    },

    _switchFormat(format) {
      const canvas = document.getElementById('doc-canvas');
      if (!canvas) return;
      canvas.className = 'doc-canvas doc-canvas-' + format.toLowerCase();

      const drawer = document.getElementById('document-preview-drawer');
      if (drawer) {
        const size = PAGE_SIZES[format];
        drawer.style.width = Math.max(size.width + 96, 650) + 'px';
      }

      if (currentInstance) currentInstance.config.format = format;
    },

    print() {
      const canvas = document.getElementById('doc-canvas');
      if (!canvas) return;

      const format = currentInstance ? currentInstance.config.format : 'A4';
      const size = PAGE_SIZES[format];

      // Create print iframe
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none;';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`<!DOCTYPE html>
<html><head>
<style>
  @page { size: \${format} portrait; margin: \${size.margin}; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111; line-height: 1.6; margin: 0; padding: 0; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #0d9488; margin-bottom: 20px; }
  .doc-title { font-size: 16px; font-weight: 700; text-align: center; margin: 20px 0; text-transform: uppercase; letter-spacing: 1px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
  th { background: #f5f5f5; font-weight: 600; }
</style>
</head><body>\${canvas.innerHTML}</body></html>`);
      doc.close();

      iframe.contentWindow.focus();
      iframe.contentWindow.print();

      setTimeout(() => iframe.remove(), 2000);
    },
  };

  window.DocumentPreview = DocumentPreview;
  window.PAGE_SIZES = PAGE_SIZES;
  window.DEFAULT_DOC_FORMATS = DEFAULT_FORMATS;
})();
