/**
 * Ant Design Segmented Control Component (Vanilla JS)
 * Usage:
 *   AntSegmented.create(containerElement, {
 *     options: [{label, value}],
 *     defaultValue: 'value1',
 *     onChange: (value) => {}
 *   });
 *   AntSegmented.setValue(containerElement, value);
 *   AntSegmented.getValue(containerElement);
 */
(function() {
  'use strict';
  
  const instanceMap = new WeakMap();
  
  const AntSegmented = {
    create(containerEl, options = {}) {
      if (!containerEl) return;
      
      const config = {
        options: options.options || [],
        defaultValue: options.defaultValue || (options.options && options.options[0] ? options.options[0].value : ''),
        onChange: options.onChange || null,
      };
      
      containerEl.className = (containerEl.className + ' ant-segmented').trim();
      containerEl.innerHTML = '';
      
      config.options.forEach(opt => {
        const item = document.createElement('div');
        item.className = 'ant-segmented-item';
        item.dataset.value = opt.value;
        item.textContent = opt.label;
        
        if (opt.value === config.defaultValue) {
          item.classList.add('active');
        }
        
        item.addEventListener('click', () => {
          AntSegmented.setValue(containerEl, opt.value);
        });
        
        containerEl.appendChild(item);
      });
      
      instanceMap.set(containerEl, config);
    },
    
    setValue(containerEl, value) {
      const config = instanceMap.get(containerEl);
      if (!config) return;
      
      containerEl.querySelectorAll('.ant-segmented-item').forEach(item => {
        item.classList.toggle('active', item.dataset.value === value);
      });
      
      if (config.onChange) config.onChange(value);
    },
    
    getValue(containerEl) {
      const active = containerEl.querySelector('.ant-segmented-item.active');
      return active ? active.dataset.value : null;
    }
  };
  
  window.AntSegmented = AntSegmented;
})();
