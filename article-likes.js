/**
 * Article like button: POST /api/article-like, localStorage prevents double-like per browser.
 */
(function (global) {
  var API = '/api/article-like';

  function storageKey(id) {
    return 'seedance_liked_' + id;
  }

  function hasLiked(id) {
    try {
      return localStorage.getItem(storageKey(id)) === '1';
    } catch (e) {
      return false;
    }
  }

  function setLiked(id) {
    try {
      localStorage.setItem(storageKey(id), '1');
    } catch (e) { /* private mode */ }
  }

  function parseCount(v) {
    var n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  /**
   * @param {HTMLElement} container
   * @param {string} articleId
   * @param {number|string} initialCount
   */
  function mount(container, articleId, initialCount) {
    if (!container || !articleId) return;
    var count = parseCount(initialCount);
    var liked = hasLiked(articleId);
    var layoutClasses = [];
    (container.className || '').split(/\s+/).forEach(function (c) {
      if (!c) return;
      if (c === 'article-like-slot' || c.indexOf('article-like-slot--') === 0) {
        layoutClasses.push(c);
      }
    });
    if (layoutClasses.indexOf('article-like-slot') === -1) {
      layoutClasses.unshift('article-like-slot');
    }
    container.innerHTML = '';
    container.className = layoutClasses.concat(['article-like-wrap']).concat(liked ? ['is-liked'] : []).join(' ').trim();
    container.setAttribute('data-article-id', articleId);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'article-like-btn';
    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
    btn.setAttribute('aria-label', liked ? 'You liked this article' : 'Like this article');

    var icon = document.createElement('span');
    icon.className = 'article-like-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\u2665';

    var num = document.createElement('span');
    num.className = 'article-like-count';
    num.textContent = String(count);

    var label = document.createElement('span');
    label.className = 'article-like-label';
    label.textContent = liked ? 'Liked' : 'Like';

    btn.appendChild(icon);
    btn.appendChild(num);
    btn.appendChild(label);
    container.appendChild(btn);

    var countEl = num;

    function applyDisplay(newCount, nowLiked) {
      liked = nowLiked;
      container.classList.toggle('is-liked', nowLiked);
      btn.setAttribute('aria-pressed', nowLiked ? 'true' : 'false');
      btn.setAttribute('aria-label', nowLiked ? 'You liked this article' : 'Like this article');
      countEl.textContent = String(parseCount(newCount));
      label.textContent = nowLiked ? 'Liked' : 'Like';
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (liked) return;
      btn.disabled = true;
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: articleId }),
      })
        .then(function (r) {
          return r.json().then(function (j) {
            return { ok: r.ok, j: j };
          });
        })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok) throw new Error((res.j && res.j.error) || 'Request failed');
          setLiked(articleId);
          applyDisplay(res.j.likeCount, true);
        })
        .catch(function () {
          btn.disabled = false;
        });
    });
  }

  global.SeedanceArticleLikes = {
    mount: mount,
    hasLiked: hasLiked,
  };
})(typeof window !== 'undefined' ? window : this);
