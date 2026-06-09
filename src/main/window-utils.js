import { screen } from 'electron';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getActiveWorkArea() {
  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay();
  return display.workArea;
}

function lockWindowZoom(browserWindow) {
  const webContents = browserWindow?.webContents;
  if (!webContents) return;

  const MIN_ZOOM_LEVEL = -1.0;
  const MAX_ZOOM_LEVEL = 1.5;

  const applyDefaultZoom = () => {
    try {
      webContents.setZoomFactor(1);
    } catch (_) {}

    try {
      webContents.setZoomLevel(0);
    } catch (_) {}
  };

  applyDefaultZoom();

  try {
    Promise.resolve(webContents.setVisualZoomLevelLimits(1, 1)).catch(() => {});
  } catch (_) {}

  try {
    Promise.resolve(webContents.setLayoutZoomLevelLimits(MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL)).catch(() => {});
  } catch (_) {}

  webContents.on('zoom-changed', (event, zoomDirection) => {
    try {
      event.preventDefault();
    } catch (_) {}

    const currentLevel = webContents.getZoomLevel();
    const step = zoomDirection === 'in' ? 0.2 : -0.2;
    const nextLevel = Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, currentLevel + step));

    try {
      webContents.setZoomLevel(nextLevel);
    } catch (_) {}
  });

  webContents.on('before-input-event', (event, input) => {
    if (!(input.control || input.meta)) return;
    const key = String(input.key || '').toLowerCase();
    if (key === '0') {
      event.preventDefault();
      applyDefaultZoom();
    }
  });
}

function keepWindowOnTop(browserWindow, enabled) {
  if (!browserWindow || !enabled) return;

  const applyAlwaysOnTop = () => {
    if (browserWindow.isDestroyed()) return;

    try {
      browserWindow.setAlwaysOnTop(true, 'floating');
    } catch (_) {}

    try {
      browserWindow.moveTop();
    } catch (_) {}
  };

  applyAlwaysOnTop();
  browserWindow.on('show', applyAlwaysOnTop);
  browserWindow.on('focus', applyAlwaysOnTop);
}

function positionWindowNearTop(browserWindow, topOffset = 16) {
  if (!browserWindow || browserWindow.isDestroyed()) return;

  const bounds = browserWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);

  const safeX = Math.round(workArea.x + Math.max(0, (workArea.width - bounds.width) / 2));
  const safeY = Math.round(workArea.y + Math.max(0, topOffset));

  browserWindow.setPosition(safeX, safeY);
}

export function getResponsiveWindowBounds({
  width,
  height,
  minWidth,
  minHeight,
  marginX = 72,
  marginY = 72
}) {
  const workArea = getActiveWorkArea();
  const maxWidth = Math.max(420, workArea.width - marginX);
  const maxHeight = Math.max(560, workArea.height - marginY);

  const safeMinWidth = Math.min(minWidth ?? Math.min(width ?? maxWidth, maxWidth), maxWidth);
  const safeMinHeight = Math.min(minHeight ?? Math.min(height ?? maxHeight, maxHeight), maxHeight);

  const safeWidth = clamp(width ?? maxWidth, safeMinWidth, maxWidth);
  const safeHeight = clamp(height ?? maxHeight, safeMinHeight, maxHeight);

  return {
    width: Math.round(safeWidth),
    height: Math.round(safeHeight),
    minWidth: Math.round(safeMinWidth),
    minHeight: Math.round(safeMinHeight)
  };
}

export function applyWindowPresentation(browserWindow, {
  maximizeOnShow = false,
  maximizeWhenTight = false,
  alwaysOnTop = false,
  topOffset = 16
} = {}) {
  if (!browserWindow) return;

  browserWindow.setMenuBarVisibility(false);
  lockWindowZoom(browserWindow);
  keepWindowOnTop(browserWindow, alwaysOnTop);

  browserWindow.once('ready-to-show', () => {
    const { workArea } = screen.getDisplayMatching(browserWindow.getBounds());
    const bounds = browserWindow.getBounds();
    const isTightFit =
      bounds.width >= workArea.width - 40 ||
      bounds.height >= workArea.height - 40;

    if ((maximizeOnShow || (maximizeWhenTight && isTightFit)) && browserWindow.isMaximizable()) {
      browserWindow.maximize();
    } else {
      positionWindowNearTop(browserWindow, topOffset);
    }

    browserWindow.show();
    browserWindow.focus();
  });
}
