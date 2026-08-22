/**
 * Ant Design Checkable Tag Component (Vanilla JS)
 * Usage:
 *   AntCheckableTag.init(containerElement, {
 *     options: ['Hypoacousie', 'Otalgie', 'Acouphènes'],
 *     targetField: 'orl-motif',  // ID of textarea to append to
 *     multiple: true,
 *     onChange: (selectedValues) => {}
 *   });
 *   AntCheckableTag.getSelected(containerElement);
 *   AntCheckableTag.reset(containerElement);
 */
(function() {
  'use strict';
  
  const instanceMap = new WeakMap();
  
  const AntCheckableTag = {
    init(containerEl, options = {}) {
      if (!containerEl) return;
      
      const config = {
        options: options.options || [],
        targetField: options.targetField || null,
        multiple: options.multiple !== false,
        selected: new Set(),
        onChange: options.onChange || null,
        separator: options.separator || ', ',
      };
      
      containerEl.innerHTML = '';
      containerEl.style.display = 'flex';
      containerEl.style.flexWrap = 'wrap';
      containerEl.style.gap = '6px';
      
      config.options.forEach(optText => {
        const tag = document.createElement('span');
        tag.className = 'ant-tag-checkable';
        tag.textContent = optText;
        tag.dataset.value = optText;
        
        tag.addEventListener('click', () => {
          if (config.selected.has(optText)) {
            config.selected.delete(optText);
            tag.classList.remove('checked');
          } else {
            if (!config.multiple) {
              // Uncheck all others
              config.selected.clear();
              containerEl.querySelectorAll('.ant-tag-checkable.checked').forEach(t => t.classList.remove('checked'));
            }
            config.selected.add(optText);
            tag.classList.add('checked');
          }
          
          // Update target field if specified
          if (config.targetField) {
            const field = document.getElementById(config.targetField);
            if (field) {
              const currentVal = field.value.trim();
              if (!currentVal.includes(optText)) {
                field.value = currentVal ? currentVal + config.separator + optText : optText;
                field.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
          }
          
          if (config.onChange) config.onChange(Array.from(config.selected));
        });
        
        containerEl.appendChild(tag);
      });
      
      instanceMap.set(containerEl, config);
    },
    
    getSelected(containerEl) {
      const config = instanceMap.get(containerEl);
      return config ? Array.from(config.selected) : [];
    },
    
    reset(containerEl) {
      const config = instanceMap.get(containerEl);
      if (!config) return;
      config.selected.clear();
      containerEl.querySelectorAll('.ant-tag-checkable.checked').forEach(t => t.classList.remove('checked'));
    }
  };
  
  window.AntCheckableTag = AntCheckableTag;
})();
