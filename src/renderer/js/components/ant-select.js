/**
 * Ant Design Select Component (Vanilla JS)
 * Converts a native <select> into a searchable, styled Ant Design Select.
 * 
 * Usage:
 *   AntSelect.enhance(selectElement, {
 *     showSearch: true,
 *     allowClear: true,
 *     showAvatar: false,
 *     placeholder: '-- Sélectionner --',
 *     onSelect: (value, option) => {},
 *     optionRenderer: (option) => html_string,
 *   });
 *   AntSelect.setValue(selectElement, value);
 *   AntSelect.getValue(selectElement);
 *   AntSelect.setOptions(selectElement, options);
 *   AntSelect.destroy(selectElement);
 */
(function() {
  'use strict';
  
  const instanceMap = new WeakMap();
  
  const AntSelect = {
    enhance(selectEl, options = {}) {
      if (!selectEl || instanceMap.has(selectEl)) return;
      
      const config = {
        showSearch: options.showSearch !== false,
        requireSearch: options.requireSearch || false,
        minSearchLength: options.minSearchLength !== undefined ? options.minSearchLength : (options.requireSearch ? 1 : 0),
        maxResults: options.maxResults || 8,
        allowClear: options.allowClear || false,
        showAvatar: options.showAvatar || false,
        placeholder: options.placeholder || selectEl.getAttribute('placeholder') || '-- Sélectionner --',
        searchPromptText: options.searchPromptText || 'Tapez pour rechercher...',
        searchEmptyText: options.searchEmptyText || 'Aucun résultat',
        searchDebounce: options.searchDebounce !== undefined ? options.searchDebounce : 250,
        onSelect: options.onSelect || null,
        optionRenderer: options.optionRenderer || null,
        width: options.width || selectEl.style.width || '100%',
      };
      
      // Create wrapper
      const wrapper = document.createElement('div');
      wrapper.className = 'ant-select';
      if (config.showSearch) wrapper.classList.add('has-search-icon');
      wrapper.style.width = config.width;
      wrapper.style.position = 'relative';
      
      // Create selector display
      const selector = document.createElement('div');
      selector.className = 'ant-select-selector';

      if (config.showSearch) {
        const searchIcon = document.createElement('span');
        searchIcon.className = 'ant-select-search-icon';
        searchIcon.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#94a3b8" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
        selector.appendChild(searchIcon);
      }
      
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ant-select-selection-search';
      
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.autocomplete = 'off';
      searchInput.className = 'ant-select-search-input';
      if (!config.showSearch) searchInput.readOnly = true;
      
      const placeholder = document.createElement('span');
      placeholder.className = 'ant-select-selection-placeholder';
      placeholder.textContent = config.placeholder;
      
      const selectedDisplay = document.createElement('span');
      selectedDisplay.className = 'ant-select-selection-item';
      selectedDisplay.style.display = 'none';
      
      searchWrap.appendChild(searchInput);
      selector.appendChild(searchWrap);
      selector.appendChild(placeholder);
      selector.appendChild(selectedDisplay);
      
      // Arrow
      const arrow = document.createElement('span');
      arrow.className = 'ant-select-arrow';
      arrow.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
      
      // Clear button
      let clearBtn = null;
      if (config.allowClear) {
        clearBtn = document.createElement('span');
        clearBtn.className = 'ant-select-clear';
        clearBtn.innerHTML = '×';
        clearBtn.style.display = 'none';
        clearBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          AntSelect.setValue(selectEl, '');
        });
      }
      
      // Dropdown
      const dropdown = document.createElement('div');
      dropdown.className = 'ant-select-dropdown';
      dropdown.style.display = 'none';
      dropdown.style.position = 'absolute';
      dropdown.style.top = '100%';
      dropdown.style.left = '0';
      dropdown.style.right = '0';
      dropdown.style.marginTop = '4px';
      dropdown.style.zIndex = '99999';
      
      // Assemble
      wrapper.appendChild(selector);
      wrapper.appendChild(arrow);
      if (clearBtn) wrapper.appendChild(clearBtn);
      wrapper.appendChild(dropdown);
      
      // Hide original select, insert wrapper
      selectEl.style.setProperty('display', 'none', 'important');
      selectEl.classList.add('ant-select-hidden-native');
      selectEl.setAttribute('aria-hidden', 'true');
      selectEl.setAttribute('tabindex', '-1');
      selectEl.parentNode.insertBefore(wrapper, selectEl);
      wrapper.appendChild(selectEl); // move select inside wrapper
      
      const instance = {
        wrapper, selector, searchInput, placeholder, selectedDisplay,
        arrow, clearBtn, dropdown, config, selectEl
      };
      instanceMap.set(selectEl, instance);
      
      // Populate dropdown from select options
      AntSelect._renderOptions(instance);
      
      // Set initial value
      if (selectEl.value) {
        AntSelect._setDisplay(instance, selectEl.value);
      }
      
      // Event: open/close
      selector.addEventListener('click', () => AntSelect._toggleDropdown(instance));
      
      // Event: search filtering
      searchInput.addEventListener('input', () => {
        AntSelect._onSearchInput(instance);
      });
      
      // Event: close on outside click
      document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
          AntSelect._closeDropdown(instance);
        }
      });
      
      // Event: keyboard navigation
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') AntSelect._closeDropdown(instance);
        if (e.key === 'Enter') {
          const highlighted = dropdown.querySelector('.ant-select-option:hover, .ant-select-option.highlighted');
          if (highlighted) highlighted.click();
        }
      });
      
      return wrapper;
    },
    
    _renderOptions(instance) {
      const { dropdown, selectEl, config } = instance;
      dropdown.innerHTML = '';
      
      const options = Array.from(selectEl.options);
      if (options.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ant-select-empty';
        empty.textContent = 'Aucun résultat';
        dropdown.appendChild(empty);
        return;
      }
      
      options.forEach(opt => {
        if (opt.value === '' && opt.textContent.startsWith('--')) return; // skip placeholder options
        
        const optionEl = document.createElement('div');
        optionEl.className = 'ant-select-option';
        optionEl.dataset.value = opt.value;
        
        if (config.optionRenderer) {
          optionEl.innerHTML = config.optionRenderer(opt);
        } else {
          let html = '';
          if (config.showAvatar) {
            const initials = (opt.textContent || '?').substring(0, 2).toUpperCase();
            html += `<span class="ant-select-option-avatar">${initials}</span>`;
          }
          html += `<span class="ant-select-option-content">${opt.textContent}</span>`;
          if (opt.dataset.secondary) {
            html += `<span class="ant-select-option-secondary">${opt.dataset.secondary}</span>`;
          }
          optionEl.innerHTML = html;
        }
        
        if (opt.value === selectEl.value) {
          optionEl.classList.add('selected');
        }
        
        optionEl.addEventListener('click', (e) => {
          e.stopPropagation();
          AntSelect.setValue(selectEl, opt.value);
          if (config.onSelect) config.onSelect(opt.value, opt);
          AntSelect._closeDropdown(instance);
        });
        
        dropdown.appendChild(optionEl);
      });
    },
    
    _toggleDropdown(instance) {
      const isOpen = instance.dropdown.style.display !== 'none';
      if (isOpen) {
        AntSelect._closeDropdown(instance);
        return;
      }

      // If search is enabled, focus the search input and do not display options until typed
      if (instance.config.showSearch) {
        instance.searchInput.value = '';
        instance.searchInput.placeholder = instance.config.placeholder || 'Rechercher un patient...';
        instance.placeholder.style.display = 'none';
        instance.selectedDisplay.style.display = 'none';
        setTimeout(() => instance.searchInput.focus(), 20);
        return;
      }

      AntSelect._openDropdown(instance);
    },
    
    _openDropdown(instance) {
      if (instance.config.showSearch && (!instance.searchInput.value || instance.searchInput.value.trim().length === 0)) {
        // Do not display dropdown until characters are entered
        instance.dropdown.style.display = 'none';
        instance.wrapper.classList.remove('open');
        return;
      }
      instance.dropdown.style.display = 'block';
      instance.wrapper.classList.add('open');
      instance.wrapper.style.zIndex = '9999';
      if (instance.config.showSearch) {
        instance.placeholder.style.display = 'none';
        instance.selectedDisplay.style.display = 'none';
      }
      AntSelect._filterOptions(instance, instance.searchInput.value || '');
    },

    _onSearchInput(instance) {
      clearTimeout(instance._searchTimer);
      instance._searchTimer = setTimeout(() => {
        const q = (instance.searchInput.value || '').trim();
        if (q.length < (instance.config.minSearchLength || 1)) {
          AntSelect._closeDropdown(instance);
          return;
        }
        if (instance.dropdown.style.display === 'none') {
          instance.dropdown.style.display = 'block';
          instance.wrapper.classList.add('open');
          instance.wrapper.style.zIndex = '9999';
          instance.placeholder.style.display = 'none';
          instance.selectedDisplay.style.display = 'none';
        }
        AntSelect._filterOptions(instance, q);
      }, instance.config.searchDebounce);
    },
    
    _closeDropdown(instance) {
      clearTimeout(instance._searchTimer);
      instance.dropdown.style.display = 'none';
      instance.wrapper.classList.remove('open');
      instance.wrapper.style.removeProperty('z-index');
      instance.searchInput.value = '';
      instance.searchInput.placeholder = '';
      AntSelect._setDisplay(instance, instance.selectEl.value);
    },

    _normalize(str) {
      return String(str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    },
    
    _filterOptions(instance, query) {
      const q = AntSelect._normalize(query);
      const options = Array.from(instance.dropdown.querySelectorAll('.ant-select-option'));
      let empty = instance.dropdown.querySelector('.ant-select-empty');

      if (instance.config.minSearchLength > 0 && q.length < instance.config.minSearchLength) {
        options.forEach(opt => { opt.style.display = 'none'; });
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'ant-select-empty';
          instance.dropdown.appendChild(empty);
        }
        empty.textContent = instance.config.searchPromptText || 'Tapez pour rechercher...';
        empty.style.display = 'block';
        return;
      }

      // Score options based on match quality (starts-with given highest priority)
      const matches = [];
      options.forEach(opt => {
        const text = AntSelect._normalize(opt.textContent);
        const secondary = AntSelect._normalize(opt.querySelector('.ant-select-option-secondary')?.textContent);
        
        let score = 0;
        if (!q) {
          score = 1;
        } else {
          // Split name into words (e.g., ["belkacem", "youcef"])
          const words = text.split(/[\s,()\-]+/).filter(Boolean);
          const secondaryWords = secondary ? secondary.split(/[\s,()\-]+/).filter(Boolean) : [];

          // 1. Exact match
          if (text === q) {
            score = 2000;
          }
          // 2. Starts-with on the main full text (Last name starts with q)
          else if (text.startsWith(q)) {
            score = 1000;
          }
          // 3. Any individual word in patient full name starts with q (First name starts with q)
          else if (words.some(w => w.startsWith(q))) {
            score = 800;
          }
          // 4. Secondary info (phone / SSN) starts with q
          else if (secondary && (secondary.startsWith(q) || secondaryWords.some(w => w.startsWith(q)))) {
            score = 600;
          }
          // 5. If query is more than 1 character, also allow substring matches within name/phone
          else if (q.length > 1) {
            if (text.includes(q)) {
              score = 300;
            } else if (secondary && secondary.includes(q)) {
              score = 200;
            }
          }
        }

        if (score > 0) {
          matches.push({ opt, score });
        } else {
          opt.style.display = 'none';
        }
      });

      // Sort matches descending by score (best starts-with first)
      matches.sort((a, b) => b.score - a.score);

      // Re-order in DOM to show best matches at top
      matches.forEach(m => {
        instance.dropdown.appendChild(m.opt);
      });

      // Limit visible results to maxResults (default: 8)
      const max = instance.config.maxResults || 8;
      matches.forEach((m, idx) => {
        if (idx < max) {
          m.opt.style.display = 'flex';
        } else {
          m.opt.style.display = 'none';
        }
      });

      // Show/hide empty state
      if (matches.length === 0) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'ant-select-empty';
          instance.dropdown.appendChild(empty);
        }
        empty.textContent = instance.config.searchEmptyText || 'Aucun patient correspondant';
        empty.style.display = 'block';
      } else if (empty) {
        empty.style.display = 'none';
      }

      // "X résultats affichés sur Y" hint when more matches than maxResults
      let footer = instance.dropdown.querySelector('.ant-select-footer-info');
      if (matches.length > max) {
        if (!footer) {
          footer = document.createElement('div');
          footer.className = 'ant-select-footer-info';
          instance.dropdown.appendChild(footer);
        }
        footer.textContent = `${max} résultats affichés sur ${matches.length} — affinez votre recherche`;
        footer.style.display = 'block';
      } else if (footer) {
        footer.style.display = 'none';
      }
    },
    
    _setDisplay(instance, value) {
      const { placeholder, selectedDisplay, clearBtn, selectEl, searchInput } = instance;
      const selectedOpt = Array.from(selectEl.options).find(o => o.value === value);
      
      if (searchInput) {
        searchInput.value = '';
        searchInput.placeholder = '';
      }

      if (selectedOpt && value) {
        placeholder.style.display = 'none';
        selectedDisplay.textContent = selectedOpt.textContent;
        selectedDisplay.style.display = 'block';
        if (clearBtn) clearBtn.style.display = 'flex';
      } else {
        placeholder.style.display = 'block';
        selectedDisplay.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
      }
    },
    
    setValue(selectEl, value) {
      const instance = instanceMap.get(selectEl);
      if (!instance) {
        selectEl.value = value;
        return;
      }
      
      selectEl.value = value;
      AntSelect._setDisplay(instance, value);
      
      // Update selected class on options
      instance.dropdown.querySelectorAll('.ant-select-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
      });
      
      // Trigger change event on original select
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    },
    
    getValue(selectEl) {
      return selectEl.value;
    },
    
    setOptions(selectEl, options) {
      // options: [{value, label, secondary?}]
      const instance = instanceMap.get(selectEl);
      selectEl.innerHTML = '';
      options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        if (opt.secondary) option.dataset.secondary = opt.secondary;
        selectEl.appendChild(option);
      });
      if (instance) AntSelect._renderOptions(instance);
    },
    
    refresh(selectEl) {
      const instance = instanceMap.get(selectEl);
      if (instance) {
        AntSelect._renderOptions(instance);
        AntSelect._setDisplay(instance, selectEl.value);
      }
    },
    
    destroy(selectEl) {
      const instance = instanceMap.get(selectEl);
      if (!instance) return;
      const { wrapper } = instance;
      selectEl.style.display = '';
      wrapper.parentNode.insertBefore(selectEl, wrapper);
      wrapper.remove();
      instanceMap.delete(selectEl);
    }
  };
  
  window.AntSelect = AntSelect;
})();
