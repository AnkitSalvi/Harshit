(function () {
  'use strict';

  let editMode = false;
  let pendingUploads = {};
  let editBtn = null;
  let toast = null;

  function getPageKey() {
    let page = window.location.pathname.split('/').pop();
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
      ensurePositioned(el);
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
    var link = e.target.closest('a');
    if (link && !e.target.closest('#cms-edit-btn')) {
      e.preventDefault();
    }
  }

  function ensurePositioned(el) {
    var pos = window.getComputedStyle(el).position;
    if (pos === 'static') {
      el.style.position = 'relative';
    }
    // Give the media container a z-index so its overlay stacks above siblings
    el.style.zIndex = '2';
  }

  /**
   * Disable pointer-events on absolute-positioned siblings that sit on top
   * of the media container and block hover/click (e.g. the dark hover overlays
   * on project cards).
   */
  function disableBlockingSiblings(container) {
    var parent = container.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach(function (sibling) {
      if (sibling === container) return;
      if (sibling.classList.contains('cms-upload-overlay')) return;
      if (sibling.classList.contains('cms-file-input')) return;
      // Only disable absolutely positioned siblings (overlays)
      var pos = window.getComputedStyle(sibling).position;
      if (pos === 'absolute' && !sibling.querySelector('[data-editable]')) {
        sibling.classList.add('cms-no-events');
      }
    });
  }

  /**
   * Disable pointer-events on absolute-positioned children inside the container
   * that could block the upload overlay (e.g. dark tint overlays).
   * Skip img, video, and elements with editable content.
   */
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

  // --- Apply Media (preview or saved) ---

  function applyMedia(container, src, isVideo) {
    var existingImg = container.querySelector('img');
    var existingVideo = container.querySelector('video');

    if (isVideo) {
      // Hide existing img
      if (existingImg) existingImg.style.display = 'none';

      if (existingVideo) {
        existingVideo.src = src;
        existingVideo.style.display = '';
      } else {
        var video = document.createElement('video');
        video.src = src;
        // Copy dimensional classes from existing img, or use defaults
        video.className = existingImg
          ? copyDimClasses(existingImg)
          : 'w-full h-full object-cover';
        video.autoplay = true;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        var overlay = container.querySelector('.cms-upload-overlay');
        container.insertBefore(video, overlay || null);
      }
    } else {
      // Remove video if present
      if (existingVideo) existingVideo.remove();

      if (existingImg) {
        existingImg.src = src;
        existingImg.style.display = '';
      } else {
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.className = 'w-full h-full object-cover';
        var overlay2 = container.querySelector('.cms-upload-overlay');
        container.insertBefore(img, overlay2 || null);
      }
    }

    // Remove placeholder backgrounds
    ['bg-stone-200', 'bg-stone-300', 'bg-stone-400',
     'bg-stone-600', 'bg-stone-700', 'bg-stone-800'].forEach(function (cls) {
      container.classList.remove(cls);
    });
  }

  function copyDimClasses(el) {
    return Array.from(el.classList).filter(function (cls) {
      return cls.startsWith('w-') || cls.startsWith('h-') ||
             cls.startsWith('aspect-') || cls === 'object-cover' ||
             cls === 'object-contain';
    }).join(' ') || 'w-full h-full object-cover';
  }

  // --- Save ---

  async function save() {
    editBtn.textContent = 'Saving\u2026';
    editBtn.disabled = true;

    try {
      // Collect texts
      var texts = {};
      document.querySelectorAll('[data-editable]').forEach(function (el) {
        texts[el.dataset.editable] = el.innerHTML;
      });

      // Load existing content to merge
      var allContent = {};
      try {
        var res = await fetch('/api/content');
        allContent = await res.json();
      } catch (e) { /* ignore */ }

      if (!allContent.pages) allContent.pages = {};
      var pageKey = getPageKey();
      var existing = allContent.pages[pageKey] || {};
      var media = existing.media || {};

      // Upload pending files
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

      // Save content
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

      // Apply texts
      if (content.texts) {
        Object.keys(content.texts).forEach(function (key) {
          var el = document.querySelector('[data-editable="' + key + '"]');
          if (el) el.innerHTML = content.texts[key];
        });
      }

      // Apply media
      if (content.media) {
        Object.keys(content.media).forEach(function (key) {
          var el = document.querySelector('[data-media="' + key + '"]');
          if (!el) return;
          var src = content.media[key];
          var isVideo = /\.(mp4|webm|mov)$/i.test(src);
          applyMedia(el, src, isVideo);
        });
      }
    } catch (e) {
      // API not available — hide edit button
      if (editBtn) editBtn.style.display = 'none';
    }
  }

  // --- Init ---
  document.addEventListener('DOMContentLoaded', function () {
    createUI();
    loadContent();
  });
})();
