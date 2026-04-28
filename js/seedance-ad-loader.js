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
            '.seedance-inline-ad-wrap .adsbygoogle{max-width:100%}' +
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

    function findTopAnchor() {
        return document.querySelector(
            'main h1, article h1, .main-page-title, .about-hero h1, .article-title, h1'
        );
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

    function findMiddleAnchor(container) {
        if (!container) return null;
        var contentNodes = Array.prototype.slice.call(
            container.querySelectorAll('p, section, article, .card, .latest-news, .hero-grid, .trending, li')
        ).filter(function (el) {
            return (
                !el.closest('.seedance-inline-ad-wrap') &&
                !el.closest('header') &&
                !el.closest('footer') &&
                !el.closest('nav')
            );
        });
        if (contentNodes.length >= 3) {
            return contentNodes[Math.floor(contentNodes.length / 2)];
        }
        var childNodes = Array.prototype.slice.call(container.children).filter(function (el) {
            var tag = String(el.tagName || '').toLowerCase();
            return tag !== 'script' && tag !== 'style' && tag !== 'header' && tag !== 'footer' && tag !== 'nav';
        });
        if (childNodes.length >= 2) {
            return childNodes[Math.floor(childNodes.length / 2)];
        }
        return null;
    }

    function run() {
        if (shouldDisableAdsForThisPage()) return;
        ensureStyle();
        ensureAdsenseScript();

        if (!document.getElementById('seedance-inline-ad-top')) {
            var topAd = createAdBlock('seedance-inline-ad-top', TOP_SLOT_ID);
            var topAnchor = findTopAnchor();
            if (!insertAfter(topAnchor, topAd)) {
                var fallbackTop = document.querySelector('header') || document.querySelector('nav') || document.body.firstElementChild;
                if (!insertAfter(fallbackTop, topAd)) document.body.insertBefore(topAd, document.body.firstChild);
            }
            requestRender(topAd.querySelector('ins.adsbygoogle'));
        }

        if (!document.getElementById('seedance-inline-ad-middle')) {
            var middleAd = createAdBlock('seedance-inline-ad-middle', MIDDLE_SLOT_ID);
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
            requestRender(middleAd.querySelector('ins.adsbygoogle'));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
