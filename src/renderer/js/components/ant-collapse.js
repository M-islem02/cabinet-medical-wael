/**
 * Ant Design Collapse Component (Vanilla JS)
 * Usage:
 *   HTML: Use .ant-collapse > .ant-collapse-item > .ant-collapse-header + .ant-collapse-content
 *   JS:  AntCollapse.init(containerSelector)
 *        AntCollapse.toggle(panelElement)
 *        AntCollapse.expandAll(containerSelector)
 *        AntCollapse.collapseAll(containerSelector)
 */
(function() {
  'use strict';
  
  const AntCollapse = {
    /**
     * Initialize collapse behavior on all .ant-collapse-header elements within container
     * @param {string} containerSelector - CSS selector for the collapse container
     */
    init(containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) return;
      
      const headers = container.querySelectorAll('.ant-collapse-header');
      headers.forEach(header => {
        const item = header.closest('.ant-collapse-item');
        let arrow = header.querySelector('.ant-collapse-arrow');
        if (arrow) {
          arrow.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
          const isCollapsed = item ? item.classList.contains('is-collapsed') : false;
          arrow.style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
          arrow.style.display = 'inline-flex';
          arrow.style.alignItems = 'center';
          arrow.style.justifyContent = 'center';
        }

        // Avoid double-binding
        if (header._collapseInitialized) return;
        header._collapseInitialized = true;
        
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking on an input, button, or link inside the header
          if (e.target.closest('input, button, a, select, textarea')) return;
          if (item) AntCollapse.toggle(item);
        });
      });
    },
    
    /**
     * Toggle a single collapse panel
     * @param {HTMLElement} panelElement - The .ant-collapse-item element
     */
    toggle(panelElement) {
      if (!panelElement) return;
      const isCollapsed = panelElement.classList.contains('is-collapsed');
      
      // Check if parent has accordion mode (data-accordion="true")
      const parent = panelElement.closest('.ant-collapse');
      if (parent && parent.dataset.accordion === 'true' && isCollapsed) {
        // In accordion mode, collapse all others first
        parent.querySelectorAll('.ant-collapse-item:not(.is-collapsed)').forEach(item => {
          item.classList.add('is-collapsed');
        });
      }
      
      panelElement.classList.toggle('is-collapsed');
      
      // Update arrow rotation
      const arrow = panelElement.querySelector('.ant-collapse-arrow');
      if (arrow) {
        arrow.style.transform = panelElement.classList.contains('is-collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
      }
      
      // Dispatch custom event
      panelElement.dispatchEvent(new CustomEvent('collapse:toggle', {
        bubbles: true,
        detail: { collapsed: panelElement.classList.contains('is-collapsed') }
      }));
    },
    
    /**
     * Expand all panels in a container
     * @param {string} containerSelector
     */
    expandAll(containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) return;
      container.querySelectorAll('.ant-collapse-item.is-collapsed').forEach(item => {
        item.classList.remove('is-collapsed');
        const arrow = item.querySelector('.ant-collapse-arrow');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
      });
    },
    
    /**
     * Collapse all panels in a container
     * @param {string} containerSelector
     */
    collapseAll(containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) return;
      container.querySelectorAll('.ant-collapse-item:not(.is-collapsed)').forEach(item => {
        item.classList.add('is-collapsed');
        const arrow = item.querySelector('.ant-collapse-arrow');
        if (arrow) arrow.style.transform = 'rotate(-90deg)';
      });
    },
    
    /**
     * Check if all panels are collapsed
     * @param {string} containerSelector
     * @returns {boolean}
     */
    isAllCollapsed(containerSelector) {
      const container = document.querySelector(containerSelector);
      if (!container) return true;
      const items = container.querySelectorAll('.ant-collapse-item');
      const collapsed = container.querySelectorAll('.ant-collapse-item.is-collapsed');
      return items.length === collapsed.length;
    },
    
    /**
     * Get count of filled fields in a panel (for badge display)
     * @param {HTMLElement} panelElement
     * @returns {number}
     */
    getFilledFieldCount(panelElement) {
      if (!panelElement) return 0;
      const content = panelElement.querySelector('.ant-collapse-content');
      if (!content) return 0;
      let count = 0;
      content.querySelectorAll('input, textarea, select').forEach(field => {
        if (field.value && field.value.trim() !== '' && field.value !== field.defaultValue) {
          count++;
        }
      });
      return count;
    },
    
    /**
     * Update badge count on a panel header
     * @param {HTMLElement} panelElement
     */
    updateBadge(panelElement) {
      const badge = panelElement.querySelector('.ant-collapse-extra .ant-badge-count');
      if (!badge) return;
      const count = AntCollapse.getFilledFieldCount(panelElement);
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  };
  
  window.AntCollapse = AntCollapse;
})();
