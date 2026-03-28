(function () {
  'use strict';

  var editMode = false;
  var pendingUploads = {};
  var editBtn = null;
  var toast = null;
  // Store original inline styles so we can restore them on exit
  var originalStyles = [];

  function getPageKey() {
    var page = window.location.pathname.split('/').pop();
    if (!page || page === '') page = 'index.html';
    return page;
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
        video.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
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
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
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
        var res = await fetch('/api/content');
        allContent = await res.json();
      } catch (e) { /* ignore */ }

      if (!allContent.pages) allContent.pages = {};
      var pageKey = getPageKey();
      var existing = allContent.pages[pageKey] || {};
      var media = existing.media || {};

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

      allContent.pages[pageKey] = { texts: texts, media: media };

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
      var res = await fetch('/api/content');
      if (!res.ok) throw new Error('API unavailable');
      var allContent = await res.json();
      var pageKey = getPageKey();
      var content = allContent.pages && allContent.pages[pageKey];
      if (!content) return;

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
