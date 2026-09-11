(function () {
  'use strict';

  var editMode = false;
  var pendingUploads = {};
  var editBtn = null;
  var toast = null;
  // Store original inline styles so we can restore them on exit
  var originalStyles = [];

  function getProjectId() {
    var match = /[?&]id=(\d+)/.exec(window.location.search);
    return match ? match[1] : '1';
  }

  function getPageKey() {
    var page = window.location.pathname.split('/').pop();
    if (!page || page === '') page = 'index.html';
    // Each project detail page keeps its own content, keyed by ?id=
    if (page === 'project.html') page += '?id=' + getProjectId();
    return page;
  }

  /**
   * Content for a page key, falling back to the content saved before
   * project pages were split per id, so existing projects keep their
   * text and images until they are edited individually.
   */
  function getPageContent(allContent, pageKey) {
    var pages = (allContent && allContent.pages) || {};
    if (pages[pageKey]) return pages[pageKey];
    if (pageKey.indexOf('project.html?') === 0) return pages['project.html'];
    return null;
  }

  // --- Card collections (Projects / Objects grids) ---

  var CARD_COLLECTIONS = {
    projects: { prefix: 'proj', link: 'project.html?id=', noun: 'Project' },
    objects:  { prefix: 'obj',  link: null,               noun: 'Object' }
  };

  function getGrids() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-collection]'))
      .filter(function (grid) { return !!CARD_COLLECTIONS[grid.dataset.collection]; });
  }

  function nextCardIndex(grid) {
    var max = 0;
    grid.querySelectorAll('[data-card-index]').forEach(function (card) {
      var n = parseInt(card.dataset.cardIndex, 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function buildCard(collection, index) {
    var cfg = CARD_COLLECTIONS[collection];
    var key = cfg.prefix + index;
    var card = document.createElement(cfg.link ? 'a' : 'div');
    card.className = 'project-card';
    card.dataset.cardIndex = index;
    card.dataset.cardDynamic = 'true';
    if (cfg.link) card.href = cfg.link + index;

    card.innerHTML =
      '<div class="project-card-img" data-media="' + key + '-card-img"></div>' +
      '<div class="project-card-overlay"></div>' +
      '<div class="project-card-content">' +
        '<p class="project-card-tag" data-editable="' + key + '-tag">Category \u2022 Year</p>' +
        '<h3 class="project-card-title" data-editable="' + key + '-title">New ' + cfg.noun + '</h3>' +
        '<p class="project-card-desc" data-editable="' + key + '-desc">Add a short description of this ' + cfg.noun.toLowerCase() + '.</p>' +
        (cfg.link ? '<span class="project-card-link">View Project &rarr;</span>' : '') +
      '</div>';

    return card;
  }

  // Turn a card added during this edit session into an editable one
  function enableCardEditing(card) {
    card.querySelectorAll('[data-editable]').forEach(function (el) {
      el.contentEditable = 'true';
      el.classList.add('cms-editable');
    });
    card.querySelectorAll('[data-media]').forEach(function (el) {
      saveAndPositionMedia(el);
      disableBlockingSiblings(el);
      disableBlockingChildren(el);
      addUploadOverlay(el);
    });
    addCardTools(card);
    relayout();
  }

  function relayout() {
    if (window.syncTileGrids) window.syncTileGrids();
  }

  function gridMetrics(grid) {
    var styles = window.getComputedStyle(grid);
    var columns = styles.gridTemplateColumns.split(' ').filter(Boolean);
    return {
      count: columns.length,
      width: parseFloat(columns[0]) || 0,
      gap: parseFloat(styles.columnGap) || 0
    };
  }

  // --- Corner resize ---

  function addResizeHandle(card) {
    if (card.querySelector('.cms-card-resize')) return;

    var handle = document.createElement('span');
    handle.className = 'cms-card-resize';
    handle.title = 'Drag to resize';

    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();

      var grid = card.closest('[data-collection]');
      if (!grid) return;

      var metrics = gridMetrics(grid);
      var rect = card.getBoundingClientRect();
      var startX = e.clientX;

      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('cms-resizing');

      function onMove(moveEvent) {
        // Width only — a tile's height stays as its image or preset sets it
        var width = rect.width + (moveEvent.clientX - startX);
        var cols = Math.round((width + metrics.gap) / (metrics.width + metrics.gap));
        cols = Math.min(Math.max(cols, 1), metrics.count);

        if (cols > 1) {
          card.dataset.cols = cols;
        } else {
          delete card.dataset.cols;
        }

        relayout();
      }

      function onUp() {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        document.body.classList.remove('cms-resizing');
        relayout();
      }

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });

    card.appendChild(handle);
  }

  function addCardTools(card) {
    if (card.querySelector('.cms-card-tools')) return;

    var tools = document.createElement('div');
    tools.className = 'cms-card-tools';

    var handle = document.createElement('span');
    handle.className = 'cms-card-drag';
    handle.title = 'Drag to reorder';
    handle.innerHTML = '\u2630';
    tools.appendChild(handle);

    if (card.dataset.cardDynamic === 'true') {
      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'cms-card-remove';
      removeBtn.title = 'Remove tile';
      removeBtn.innerHTML = '\u00d7';

      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        card.querySelectorAll('[data-media]').forEach(function (el) {
          var key = el.dataset.media;
          if (pendingUploads[key]) {
            if (pendingUploads[key].objectURL) URL.revokeObjectURL(pendingUploads[key].objectURL);
            delete pendingUploads[key];
          }
        });
        card.remove();
        relayout();
      });

      tools.appendChild(removeBtn);
    }

    card.appendChild(tools);
    addResizeHandle(card);
  }

  // --- Drag to arrange (SortableJS) ---

  var sortables = [];

  function initSorting() {
    if (typeof Sortable === 'undefined') return;

    getGrids().forEach(function (grid) {
      sortables.push(Sortable.create(grid, {
        animation: 160,
        draggable: '.project-card',
        handle: '.cms-card-drag',
        ghostClass: 'cms-card-ghost',
        onEnd: function () {
          // Keep the "Add Tile" placeholder at the end of the grid
          var tile = grid.querySelector('.cms-add-card');
          if (tile) grid.appendChild(tile);
          relayout();
        }
      }));
    });
  }

  function destroySorting() {
    sortables.forEach(function (sortable) { sortable.destroy(); });
    sortables = [];
  }

  function addAddTiles() {
    getGrids().forEach(function (grid) {
      var collection = grid.dataset.collection;

      var tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'cms-add-card';
      tile.innerHTML =
        '<span class="cms-add-card-inner">' +
          '<span class="cms-add-card-plus">+</span>' +
          '<span>Add Tile</span>' +
        '</span>';

      tile.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var card = buildCard(collection, nextCardIndex(grid));
        grid.insertBefore(card, tile);
        enableCardEditing(card);
      });

      grid.appendChild(tile);
    });
  }

  function removeAddTiles() {
    document.querySelectorAll('.cms-add-card, .cms-card-tools, .cms-card-resize').forEach(function (el) {
      el.remove();
    });
    relayout();
  }

  function createUI() {
    editBtn = document.createElement('button');
    editBtn.id = 'cms-edit-btn';
    editBtn.textContent = 'Edit';
    document.body.appendChild(editBtn);

    editBtn.addEventListener('click', function () {
      if (editMode) {
        save();
      } else {
        enterEditMode();
      }
    });

    toast = document.createElement('div');
    toast.id = 'cms-toast';
    document.body.appendChild(toast);
  }

  function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'cms-toast-show cms-toast-' + (type || 'success');
    setTimeout(function () {
      toast.className = '';
    }, 3000);
  }

  // --- Edit Mode ---

  function enterEditMode() {
    editMode = true;
    originalStyles = [];
    editBtn.textContent = 'Save';
    editBtn.classList.add('cms-save-mode');
    document.body.classList.add('cms-editing');

    // Text elements
    document.querySelectorAll('[data-editable]').forEach(function (el) {
      el.contentEditable = 'true';
      el.classList.add('cms-editable');
    });

    // Media elements
    document.querySelectorAll('[data-media]').forEach(function (el) {
      saveAndPositionMedia(el);
      disableBlockingSiblings(el);
      disableBlockingChildren(el);
      addUploadOverlay(el);
    });

    // Card grids: per-tile controls, an "Add Tile" placeholder, drag to arrange
    getGrids().forEach(function (grid) {
      grid.querySelectorAll('.project-card').forEach(addCardTools);
    });
    addAddTiles();
    initSorting();
    relayout();

    // Block link navigation
    document.addEventListener('click', blockLinks, true);
  }

  function exitEditMode() {
    editMode = false;
    editBtn.textContent = 'Edit';
    editBtn.classList.remove('cms-save-mode');
    document.body.classList.remove('cms-editing');

    document.querySelectorAll('[data-editable]').forEach(function (el) {
      el.contentEditable = 'false';
      el.classList.remove('cms-editable');
    });

    document.querySelectorAll('.cms-upload-overlay, .cms-file-input').forEach(function (el) {
      el.remove();
    });

    destroySorting();
    removeAddTiles();

    // Restore pointer events on elements we disabled
    document.querySelectorAll('.cms-no-events').forEach(function (el) {
      el.classList.remove('cms-no-events');
    });

    // Restore original inline styles on media containers
    originalStyles.forEach(function (entry) {
      entry.el.style.position = entry.position;
      entry.el.style.zIndex = entry.zIndex;
    });
    originalStyles = [];

    document.removeEventListener('click', blockLinks, true);

    // Clean up object URLs
    Object.keys(pendingUploads).forEach(function (key) {
      if (pendingUploads[key].objectURL) {
        URL.revokeObjectURL(pendingUploads[key].objectURL);
      }
    });
    pendingUploads = {};
  }

  function blockLinks(e) {
    // Don't block clicks on upload overlays or file inputs — browsers need
    // a clean user gesture to open the file dialog via input.click()
    if (e.target.closest('.cms-upload-overlay') || e.target.closest('.cms-file-input')) {
      return;
    }
    var link = e.target.closest('a');
    if (link && !e.target.closest('#cms-edit-btn')) {
      e.preventDefault();
    }
  }

  /**
   * Save original inline styles, then set position/zIndex for the overlay.
   * The original values are restored in exitEditMode.
   */
  function saveAndPositionMedia(el) {
    // Store originals
    originalStyles.push({
      el: el,
      position: el.style.position || '',
      zIndex: el.style.zIndex || ''
    });

    var pos = window.getComputedStyle(el).position;
    if (pos === 'static') {
      el.style.position = 'relative';
    }
    // Don't override z-index on elements that are inside layered structures
    // Only set z-index if needed for the overlay to render
    el.style.zIndex = '2';
  }

  function disableBlockingSiblings(container) {
    var parent = container.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach(function (sibling) {
      if (sibling === container) return;
      if (sibling.classList.contains('cms-upload-overlay')) return;
      if (sibling.classList.contains('cms-file-input')) return;
      var pos = window.getComputedStyle(sibling).position;
      if (pos === 'absolute' && !sibling.querySelector('[data-editable]')) {
        sibling.classList.add('cms-no-events');
      }
    });
  }

  function disableBlockingChildren(container) {
    Array.from(container.children).forEach(function (child) {
      if (child.tagName === 'IMG' || child.tagName === 'VIDEO') return;
      if (child.classList.contains('cms-upload-overlay')) return;
      if (child.classList.contains('cms-file-input')) return;
      if (child.querySelector('[data-editable]')) return;
      var pos = window.getComputedStyle(child).position;
      if (pos === 'absolute') {
        child.classList.add('cms-no-events');
      }
    });
  }

  // --- Upload Overlay ---

  function addUploadOverlay(container) {
    var overlay = document.createElement('div');
    overlay.className = 'cms-upload-overlay';
    overlay.innerHTML =
      '<div class="cms-upload-content">' +
        '<svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">' +
          '<path d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '<span>Upload image or video</span>' +
      '</div>';

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime';
    input.className = 'cms-file-input';
    input.style.display = 'none';

    container.appendChild(overlay);
    container.appendChild(input);

    overlay.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      input.click();
    });

    input.addEventListener('change', function () {
      var file = input.files[0];
      if (!file) return;

      var key = container.dataset.media;
      var objectURL = URL.createObjectURL(file);
      pendingUploads[key] = { file: file, objectURL: objectURL };

      var isVideo = file.type.startsWith('video/');
      applyMedia(container, objectURL, isVideo);
    });
  }

  // --- Apply Media ---

  function applyMedia(container, src, isVideo) {
    container.classList.add('has-media');

    // Tiles size themselves from the image, so leave their sizing to CSS
    var isTile = container.classList.contains('project-card-img');
    var imgStyle = isTile ? '' : 'width:100%;height:100%;object-fit:cover;';
    var videoStyle = isTile ? '' : 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';

    var existingImg = container.querySelector(':scope > img');
    var existingVideo = container.querySelector(':scope > video');

    // Remove placeholder div children (like the hero gradient)
    Array.from(container.children).forEach(function (child) {
      if (child.tagName === 'IMG' || child.tagName === 'VIDEO') return;
      if (child.classList && child.classList.contains('cms-upload-overlay')) return;
      if (child.classList && child.classList.contains('cms-file-input')) return;
      // It's a placeholder div — remove it
      if (child.tagName === 'DIV' && !child.hasAttribute('data-editable') && !child.hasAttribute('data-media')) {
        child.remove();
      }
    });

    if (isVideo) {
      if (existingImg) existingImg.style.display = 'none';

      if (existingVideo) {
        existingVideo.src = src;
        existingVideo.style.display = '';
      } else {
        var video = document.createElement('video');
        video.src = src;
        video.style.cssText = videoStyle;
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        var overlay = container.querySelector('.cms-upload-overlay');
        container.insertBefore(video, overlay || null);
      }
    } else {
      if (existingVideo) existingVideo.remove();

      if (existingImg) {
        existingImg.src = src;
        existingImg.style.display = '';
      } else {
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.style.cssText = imgStyle;
        var overlay2 = container.querySelector('.cms-upload-overlay');
        container.insertBefore(img, overlay2 || null);
      }
    }
  }

  // --- Save ---

  async function save() {
    editBtn.textContent = 'Saving\u2026';
    editBtn.disabled = true;

    try {
      var texts = {};
      document.querySelectorAll('[data-editable]').forEach(function (el) {
        texts[el.dataset.editable] = el.innerHTML;
      });

      var allContent = {};
      try {
        var res = await fetch('/api/content?_t=' + Date.now());
        allContent = await res.json();
      } catch (e) { /* ignore */ }

      if (!allContent.pages) allContent.pages = {};
      var pageKey = getPageKey();
      var existing = getPageContent(allContent, pageKey) || {};
      var media = Object.assign({}, existing.media || {});

      var keys = Object.keys(pendingUploads);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var formData = new FormData();
        formData.append('file', pendingUploads[key].file);
        var uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) throw new Error('Upload failed for ' + key);
        var uploadData = await uploadRes.json();
        media[key] = uploadData.path;
      }

      // Tiles added through the editor, the arrangement, and tile shapes
      var cards = {};
      var order = {};
      var sizes = {};

      getGrids().forEach(function (grid) {
        var collection = grid.dataset.collection;
        var added = [];
        var arrangement = [];
        var shapes = {};

        grid.querySelectorAll('.project-card[data-card-index]').forEach(function (card) {
          var index = parseInt(card.dataset.cardIndex, 10);
          arrangement.push(index);
          if (card.dataset.cardDynamic === 'true') added.push(index);
          if (card.dataset.cols) {
            shapes[index] = { cols: parseInt(card.dataset.cols, 10) };
          }
        });

        if (added.length) cards[collection] = added;
        if (arrangement.length) order[collection] = arrangement;
        if (Object.keys(shapes).length) sizes[collection] = shapes;
      });

      // Forget images belonging to tiles that were removed
      Object.keys(media).forEach(function (key) {
        if (!/^(proj|obj)\d+-card-img$/.test(key)) return;
        if (!document.querySelector('[data-media="' + key + '"]')) delete media[key];
      });

      allContent.pages[pageKey] = {
        texts: texts,
        media: media,
        cards: cards,
        order: order,
        sizes: sizes
      };

      var saveRes = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(allContent)
      });
      if (!saveRes.ok) throw new Error('Save failed');

      exitEditMode();
      showToast('Changes saved');
    } catch (err) {
      console.error('Save error:', err);
      showToast('Save failed \u2014 please try again', 'error');
      editBtn.textContent = 'Save';
    }

    editBtn.disabled = false;
  }

  // --- Load Saved Content ---

  async function loadContent() {
    try {
      var res = await fetch('/api/content?_t=' + Date.now());
      if (!res.ok) throw new Error('API unavailable');
      var allContent = await res.json();
      var pageKey = getPageKey();
      var content = getPageContent(allContent, pageKey);
      if (!content) return;

      if (content.cards) {
        Object.keys(content.cards).forEach(function (collection) {
          var grid = document.querySelector('[data-collection="' + collection + '"]');
          if (!grid || !CARD_COLLECTIONS[collection]) return;
          content.cards[collection].forEach(function (index) {
            if (grid.querySelector('[data-card-index="' + index + '"]')) return;
            grid.appendChild(buildCard(collection, index));
          });
        });
      }

      if (content.order) {
        Object.keys(content.order).forEach(function (collection) {
          var grid = document.querySelector('[data-collection="' + collection + '"]');
          if (!grid) return;
          content.order[collection].forEach(function (index) {
            var card = grid.querySelector('[data-card-index="' + index + '"]');
            if (card) grid.appendChild(card);
          });
        });
      }

      if (content.sizes) {
        Object.keys(content.sizes).forEach(function (collection) {
          var grid = document.querySelector('[data-collection="' + collection + '"]');
          if (!grid) return;
          var shapes = content.sizes[collection];
          Object.keys(shapes).forEach(function (index) {
            var card = grid.querySelector('[data-card-index="' + index + '"]');
            if (!card) return;

            var shape = shapes[index];
            // 'wide' is the old preset name for a two-column tile
            if (typeof shape === 'string') {
              if (shape === 'wide') card.dataset.cols = 2;
              return;
            }

            if (shape.cols > 1) card.dataset.cols = shape.cols;
          });
        });
      }

      if (content.texts) {
        Object.keys(content.texts).forEach(function (key) {
          var el = document.querySelector('[data-editable="' + key + '"]');
          if (el) el.innerHTML = content.texts[key];
        });
      }

      if (content.media) {
        Object.keys(content.media).forEach(function (key) {
          var el = document.querySelector('[data-media="' + key + '"]');
          if (!el) return;
          var src = content.media[key];
          if (!src) return;
          var isVideo = /\.(mp4|webm|mov)$/i.test(src);
          applyMedia(el, src, isVideo);
        });
      }
      relayout();
    } catch (e) {
      if (editBtn) editBtn.style.display = 'none';
    }
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    createUI();
    loadContent();
  });
})();
