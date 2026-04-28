/**
 * Injects two AdSense units on every public page:
 * 1) below the first page title (h1)
 * 2) around the middle of main content
 */
(function () {
    var AD_CLIENT = 'ca-pub-9842312153702889';
    var TOP_SLOT_ID = '4831027607';
    var MIDDLE_SLOT_ID = '2815238354';
    var ADSENSE_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + AD_CLIENT;

    function shouldDisableAdsForThisPage() {
        try {
            var u = new URL(window.location.href);
            var host = String(u.hostname || '').toLowerCase();
            var path = String(u.pathname || '').toLowerCase();
            var forceOn = (u.searchParams.get('ads') || '').toLowerCase() === 'on';
            var forceOff = (u.searchParams.get('ads') || '').toLowerCase() === 'off';
            if (forceOn) return false;
            if (forceOff) return true;
            if (path === '/admin' || path === '/admin.html' || path.indexOf('/admin/') === 0) return true;
            // Keep preview/staging clean by default.
            return host.endsWith('.pages.dev');
        } catch (e) {
            return false;
        }
    }

    function ensureStyle() {
        if (document.getElementById('seedance-inline-ads-style')) return;
        var st = document.createElement('style');
        st.id = 'seedance-inline-ads-style';
        st.textContent =
            '.seedance-inline-ad-wrap{margin:1.25rem auto;max-width:100%;padding:0 1rem;text-align:center}' +
            '.seedance-ad-slot{margin:1.25rem auto;max-width:100%;padding:0 1rem;text-align:center}' +
            '#seedance-inline-ad-middle{margin-top:3.5rem}' +
            '.seedance-inline-ad-wrap .adsbygoogle{max-width:100%}' +
            '.seedance-ad-slot .adsbygoogle{max-width:100%}' +
            '@media (max-width:420px){.seedance-inline-ad-wrap{padding:0 0.5rem}}';
        document.head.appendChild(st);
    }

    function ensureAdsenseScript() {
        if (document.querySelector('script[data-seedance-adsense-loader="1"]')) return;
        var s = document.createElement('script');
        s.async = true;
        s.src = ADSENSE_SRC;
        s.setAttribute('crossorigin', 'anonymous');
        s.setAttribute('data-seedance-adsense-loader', '1');
        document.head.appendChild(s);
    }

    function createAdBlock(id, slotId) {
        var wrap = document.createElement('section');
        wrap.id = id;
        wrap.className = 'seedance-inline-ad-wrap';
        wrap.setAttribute('aria-label', 'Advertisement');

        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'inline-block';
        ins.style.width = '300px';
        ins.style.height = '250px';
        ins.setAttribute('data-ad-client', AD_CLIENT);
        ins.setAttribute('data-ad-slot', slotId);
        wrap.appendChild(ins);

        return wrap;
    }

    function requestRender(ins) {
        if (!ins) return;
        try {
            (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (e) {}
    }

    function insertAfter(anchor, node) {
        if (!anchor || !anchor.parentNode || !node) return false;
        if (anchor.nextSibling) {
            anchor.parentNode.insertBefore(node, anchor.nextSibling);
        } else {
            anchor.parentNode.appendChild(node);
        }
        return true;
    }

    function insertBefore(anchor, node) {
        if (!anchor || !anchor.parentNode || !node) return false;
        anchor.parentNode.insertBefore(node, anchor);
        return true;
    }

    function findTopAnchor() {
        return document.querySelector(
            'main h1, article h1, .main-page-title, .about-hero h1, .article-title, h1'
        );
    }

    function isArticleDetailPage() {
        return !!(document.getElementById('articleContent') && document.getElementById('articleMedia'));
    }

    function findStableTopAnchor() {
        return (
            document.querySelector('.site-nav-bar') ||
            document.querySelector('nav[aria-label="Site navigation"]') ||
            document.querySelector('header') ||
            null
        );
    }

    function getMiddleMountPoint() {
        var root = document.getElementById('seedance-ad-root');
        if (root) return root;
        return null;
    }

    function getPrimaryContentContainer() {
        return (
            document.querySelector('main article .prose') ||
            document.querySelector('main article') ||
            document.querySelector('article .prose') ||
            document.querySelector('article') ||
            document.querySelector('main') ||
            document.querySelector('.wrap') ||
            document.body
        );
    }

    function isCardLike(el) {
        if (!el || !el.classList) return false;
        var className = String(el.className || '').toLowerCase();
        return className.indexOf('card') !== -1;
    }

    function isUnsafeMiddlePlacement(el) {
        if (!el) return true;
        var tag = String(el.tagName || '').toLowerCase();
        if (!tag || tag === 'script' || tag === 'style' || tag === 'header' || tag === 'footer' || tag === 'nav') return true;
        if (el.id === 'seedance-ad-root') return true;
        if (isCardLike(el)) return true;
        if (el.closest && (el.closest('.seedance-inline-ad-wrap') || el.closest('header') || el.closest('footer') || el.closest('nav'))) return true;
        if (el.closest && el.closest('[class*="card"]')) return true;
        return false;
    }

    function findMiddleAnchor(container) {
        if (!container) return null;

        var directChildren = Array.prototype.slice.call(container.children).filter(function (el) {
            return !isUnsafeMiddlePlacement(el);
        });
        if (directChildren.length >= 2) {
            return directChildren[Math.floor(directChildren.length / 2)];
        }

        // For long-form article pages, use text blocks as secondary anchors.
        var textBlocks = Array.prototype.slice.call(
            container.querySelectorAll('p, h2, h3, h4, li, blockquote')
        ).filter(function (el) {
            if (isUnsafeMiddlePlacement(el)) return false;
            if (el.closest && el.closest('main, article') === null) return false;
            return true;
        });
        if (textBlocks.length >= 4) {
            return textBlocks[Math.floor(textBlocks.length / 2)];
        }

        return null;
    }

    function run() {
        if (shouldDisableAdsForThisPage()) return;
        ensureStyle();
        ensureAdsenseScript();

        if (!document.getElementById('seedance-inline-ad-top')) {
            var topAd = createAdBlock('seedance-inline-ad-top', TOP_SLOT_ID);
            var insertedTop = false;

            // On article detail pages, place top ad above cover media.
            if (isArticleDetailPage()) {
                insertedTop = insertBefore(document.getElementById('articleMedia'), topAd);
            }

            if (!insertedTop) {
                var stableTopAnchor = findStableTopAnchor();
                insertedTop = insertAfter(stableTopAnchor, topAd);
            }

            if (!insertedTop) {
                var topAnchor = findTopAnchor();
                insertedTop = insertAfter(topAnchor, topAd);
            }

            if (!insertedTop) {
                var fallbackTop = document.querySelector('header') || document.querySelector('nav') || document.body.firstElementChild;
                if (!insertAfter(fallbackTop, topAd)) document.body.insertBefore(topAd, document.body.firstChild);
            }
            requestRender(topAd.querySelector('ins.adsbygoogle'));
        }

        if (!document.getElementById('seedance-inline-ad-middle')) {
            var middleMountPoint = getMiddleMountPoint();
            var middleAd = createAdBlock('seedance-inline-ad-middle', MIDDLE_SLOT_ID);

            if (middleMountPoint) {
                middleMountPoint.innerHTML = '';
                middleMountPoint.appendChild(middleAd);
            } else {
                var container = getPrimaryContentContainer();
                var middleAnchor = findMiddleAnchor(container);
                if (!insertAfter(middleAnchor, middleAd)) {
                    var footer = document.querySelector('footer');
                    if (footer && footer.parentNode) {
                        footer.parentNode.insertBefore(middleAd, footer);
                    } else if (container) {
                        container.appendChild(middleAd);
                    } else {
                        document.body.appendChild(middleAd);
                    }
                }
            }

            requestRender(middleAd.querySelector('ins.adsbygoogle'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
