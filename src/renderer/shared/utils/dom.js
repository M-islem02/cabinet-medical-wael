export function requireElement(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

export function optionalElement(selector, root = document) {
  return root.querySelector(selector);
}

export function setText(element, value) {
  if (element) element.textContent = value == null ? '' : String(value);
  return element;
}

export function clearChildren(element) {
  while (element?.firstChild) element.removeChild(element.firstChild);
}

export function createElement(tagName, options = {}) {
  const element = document.createElement(tagName);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) setText(element, options.text);
  for (const [key, value] of Object.entries(options.attributes || {})) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function setVisible(element, visible) {
  if (element) element.style.display = visible ? '' : 'none';
}

export function listen(target, eventName, handler, options, cleanupCallbacks = []) {
  target.addEventListener(eventName, handler, options);
  const cleanup = () => target.removeEventListener(eventName, handler, options);
  cleanupCallbacks.push(cleanup);
  return cleanup;
}
