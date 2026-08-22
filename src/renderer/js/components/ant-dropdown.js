/**
 * Ant Design Dropdown Component (Vanilla JS)
 * Usage:
 *   AntDropdown.create(triggerElement, menuItems, options)
 *   menuItems: [{ key, label, icon?, danger?, disabled?, divider? }]
 */
(function() {
  'use strict';
  
  let activeDropdown = null;
  
  const AntDropdown = {
    create(triggerEl, menuItems, options = {}) {
      if (!triggerEl) return;
      
      const config = {
        placement: options.placement || 'bottomLeft',
        trigger: options.trigger || 'click',
        onClick: options.onClick || null,
      };
      
      triggerEl.addEventListener(config.trigger === 'hover' ? 'mouseenter' : 'click', (e) => {
        e.stopPropagation();
        AntDropdown._show(triggerEl, menuItems, config);
      });
      
      if (config.trigger === 'hover') {
        triggerEl.addEventListener('mouseleave', (e) => {
          setTimeout(() => {
            if (activeDropdown && !activeDropdown.matches(':hover')) {
              AntDropdown._hideAll();
            }
          }, 100);
        });
      }
    },
    
    _show(triggerEl, menuItems, config) {
      AntDropdown._hideAll();
      
      const dropdown = document.createElement('div');
      dropdown.className = 'ant-dropdown';
      
      menuItems.forEach(item => {
        if (item.divider) {
          const div = document.createElement('div');
          div.className = 'ant-dropdown-menu-divider';
          dropdown.appendChild(div);
          return;
        }
        
        const menuItem = document.createElement('div');
        menuItem.className = 'ant-dropdown-menu-item';
        if (item.danger) menuItem.classList.add('ant-dropdown-menu-item-danger');
        if (item.disabled) menuItem.classList.add('ant-dropdown-menu-item-disabled');
        
        let html = '';
        if (item.icon) html += `<span class="ant-dropdown-menu-item-icon">${item.icon}</span>`;
        html += `<span>${item.label}</span>`;
        menuItem.innerHTML = html;
        
        if (!item.disabled) {
          menuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            if (config.onClick) config.onClick(item.key, item);
            AntDropdown._hideAll();
          });
        }
        
        dropdown.appendChild(menuItem);
      });
      
      // Position
      document.body.appendChild(dropdown);
      const rect = triggerEl.getBoundingClientRect();
      const placement = config.placement;
      
      if (placement === 'topRight') {
        dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
        dropdown.style.right = (window.innerWidth - rect.right) + 'px';
        dropdown.style.top = 'auto';
        dropdown.style.left = 'auto';
      } else {
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.left = rect.left + 'px';
      }
      
      activeDropdown = dropdown;
      
      // Close on outside click
      setTimeout(() => {
        document.addEventListener('click', AntDropdown._hideAll, { once: true });
      }, 0);
    },
    
    _hideAll() {
      document.querySelectorAll('.ant-dropdown').forEach(d => d.remove());
      activeDropdown = null;
    }
  };
  
  window.AntDropdown = AntDropdown;
})();
