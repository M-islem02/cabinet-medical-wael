const target = new EventTarget();

export const eventBus = Object.freeze({
  emit(type, detail = undefined) {
    target.dispatchEvent(new CustomEvent(type, { detail }));
  },
  on(type, listener, options) {
    const handler = (event) => listener(event.detail, event);
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener(type, handler, options);
  }
});
