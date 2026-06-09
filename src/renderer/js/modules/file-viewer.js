// ========== FILE VIEWER ==========

let currentFileViewerZoom = 1;
let currentFileViewerMode = null;
let currentFileViewerDataUrl = '';
let currentFileViewerName = '';
let currentFileViewerPath = '';
let currentFileViewerPanX = 0;
let currentFileViewerPanY = 0;
let currentFileViewerDragging = false;
let currentFileViewerDragStartX = 0;
let currentFileViewerDragStartY = 0;

function clampFileViewerZoom(value) {
  return Math.min(4, Math.max(0.5, value));
}

function buildFileViewerToolbar() {
  return `
    <div class="file-viewer-toolbar">
      <div class="file-viewer-toolbar-left">
        <button class="btn btn-secondary" onclick="adjustFileViewerZoom(-0.1)">-</button>
        <button class="btn btn-secondary" onclick="resetFileViewerZoom()">100%</button>
        <button class="btn btn-secondary" onclick="adjustFileViewerZoom(0.1)">+</button>
      </div>
      <div class="file-viewer-toolbar-right">
        <button class="btn btn-primary" onclick="downloadCurrentViewedFile()">Télécharger</button>
      </div>
    </div>
  `;
}

function getCurrentFileViewerTransform() {
  return `translate(${currentFileViewerPanX}px, ${currentFileViewerPanY}px) scale(${currentFileViewerZoom})`;
}

function renderCurrentFileViewerContent() {
  const content = document.getElementById('file-viewer-content');
  if (!content) return;

  const zoomPercent = Math.round(currentFileViewerZoom * 100);
  const dataUrlWithZoom = currentFileViewerMode === 'pdf'
    ? `${currentFileViewerDataUrl}#toolbar=0&navpanes=0&zoom=${zoomPercent}`
    : currentFileViewerDataUrl;

  if (currentFileViewerMode === 'pdf') {
    content.innerHTML = `
      ${buildFileViewerToolbar()}
      <div class="file-viewer-stage">
        <iframe id="file-viewer-frame" src="${dataUrlWithZoom}" class="file-viewer-frame"></iframe>
      </div>
    `;
    return;
  }

  if (currentFileViewerMode === 'image') {
    content.innerHTML = `
      ${buildFileViewerToolbar()}
      <div class="file-viewer-stage">
        <div id="file-viewer-image-shell" class="file-viewer-image-shell" onwheel="handleFileViewerWheel(event)" onmousedown="startFileViewerDrag(event)" onmousemove="dragFileViewerImage(event)" onmouseup="stopFileViewerDrag()" onmouseleave="stopFileViewerDrag()">
          <img id="file-viewer-image" src="${dataUrlWithZoom}" class="file-viewer-image" draggable="false" style="transform: ${getCurrentFileViewerTransform()};">
        </div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    ${buildFileViewerToolbar()}
    <div class="file-viewer-empty">
      <p>Aperçu intégré non disponible pour ce format.</p>
      <p>Le document peut toujours être téléchargé depuis l'application.</p>
    </div>
  `;
}

// View file (PDF/Image) in modal
async function viewFile(filePath, fileName) {
  try {
    const fileExtension = fileName.split('.').pop().toLowerCase();
    const content = document.getElementById('file-viewer-content');
    const titleEl = document.getElementById('file-viewer-title');
    
    titleEl.textContent = fileName;

    const fileResult = await window.api.file.readAsDataURL(filePath);
    if (!fileResult.success) {
      throw new Error(fileResult.error || 'Lecture du fichier impossible');
    }

    currentFileViewerZoom = 1;
    currentFileViewerPanX = 0;
    currentFileViewerPanY = 0;
    currentFileViewerDragging = false;
    currentFileViewerDataUrl = fileResult.dataURL;
    currentFileViewerName = fileName;
    currentFileViewerPath = filePath;

    if (['pdf'].includes(fileExtension)) {
      currentFileViewerMode = 'pdf';
    } else if (['jpg', 'jpeg', 'png', 'tiff', 'gif', 'bmp', 'webp'].includes(fileExtension)) {
      currentFileViewerMode = 'image';
    } else {
      currentFileViewerMode = 'unsupported';
    }

    renderCurrentFileViewerContent();
    
    showModal('modal-view-file');
  } catch (error) {
    console.error('Error viewing file:', error);
    showNotification('Erreur lors de l\'ouverture du fichier', 'error');
  }
}

// Download file to the local machine
async function downloadFile(filePath, fileName) {
  try {
    const result = await window.api.file.readAsDataURL(filePath);
    if (!result?.success || !result.dataURL) {
      showNotification('Erreur lors du téléchargement du fichier', 'error');
      return;
    }

    const link = document.createElement('a');
    link.href = result.dataURL;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Error downloading file:', error);
    showNotification('Erreur lors du téléchargement', 'error');
  }
}

function adjustFileViewerZoom(delta) {
  currentFileViewerZoom = clampFileViewerZoom(currentFileViewerZoom + delta);
  renderCurrentFileViewerContent();
}

function resetFileViewerZoom() {
  currentFileViewerZoom = 1;
  currentFileViewerPanX = 0;
  currentFileViewerPanY = 0;
  renderCurrentFileViewerContent();
}

function handleFileViewerWheel(event) {
  if (currentFileViewerMode !== 'image') return;
  event.preventDefault();
  adjustFileViewerZoom(event.deltaY < 0 ? 0.1 : -0.1);
}

function startFileViewerDrag(event) {
  if (currentFileViewerMode !== 'image') return;
  currentFileViewerDragging = true;
  currentFileViewerDragStartX = event.clientX - currentFileViewerPanX;
  currentFileViewerDragStartY = event.clientY - currentFileViewerPanY;
  document.getElementById('file-viewer-image-shell')?.classList.add('is-dragging');
}

function dragFileViewerImage(event) {
  if (!currentFileViewerDragging || currentFileViewerMode !== 'image') return;
  currentFileViewerPanX = event.clientX - currentFileViewerDragStartX;
  currentFileViewerPanY = event.clientY - currentFileViewerDragStartY;
  const image = document.getElementById('file-viewer-image');
  if (image) {
    image.style.transform = getCurrentFileViewerTransform();
  }
}

function stopFileViewerDrag() {
  currentFileViewerDragging = false;
  document.getElementById('file-viewer-image-shell')?.classList.remove('is-dragging');
}

function downloadCurrentViewedFile() {
  if (!currentFileViewerPath || !currentFileViewerName) return;
  return downloadFile(currentFileViewerPath, currentFileViewerName);
}

window.viewFile = viewFile;
window.downloadFile = downloadFile;
window.adjustFileViewerZoom = adjustFileViewerZoom;
window.resetFileViewerZoom = resetFileViewerZoom;
window.downloadCurrentViewedFile = downloadCurrentViewedFile;
window.handleFileViewerWheel = handleFileViewerWheel;
window.startFileViewerDrag = startFileViewerDrag;
window.dragFileViewerImage = dragFileViewerImage;
window.stopFileViewerDrag = stopFileViewerDrag;
