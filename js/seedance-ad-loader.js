/**
 * Loads /ads-snippet.html (paste your ad network "GET CODE" there) and injects it
 * into #seedance-ad-root. Scripts are re-created so they execute.
 */
(function () {
    function ensureStyle() {
        if (document.getElementById('seedance-ad-slot-style')) return;
        var st = document.createElement('style');
        st.id = 'seedance-ad-slot-style';
        st.textContent =
            '.seedance-ad-slot{margin:1.25rem auto;max-width:728px;padding:0 1rem;text-align:center;min-height:0}';
        document.head.appendChild(st);
    }

    function appendParsed(container, html) {
        var text = String(html || '').trim();
        if (!text) return;
        var tmp = document.createElement('div');
        tmp.innerHTML = text;
        while (tmp.firstChild) {
            var node = tmp.firstChild;
            tmp.removeChild(node);
            if (node.nodeName === 'SCRIPT') {
                var s = document.createElement('script');
                for (var i = 0; i < node.attributes.length; i++) {
                    var a = node.attributes[i];
                    s.setAttribute(a.name, a.value);
                }
                s.textContent = node.textContent;
                container.appendChild(s);
            } else {
                container.appendChild(node);
            }
        }
    }

    function run() {
        ensureStyle();
        var el = document.getElementById('seedance-ad-root');
        if (!el) {
            el = document.createElement('div');
            el.id = 'seedance-ad-root';
            el.className = 'seedance-ad-slot';
            document.body.appendChild(el);
        }
        fetch('/ads-snippet.html', { cache: 'no-store' })
            .then(function (r) {
                return r.ok ? r.text() : '';
            })
            .then(function (html) {
                appendParsed(el, html);
            })
            .catch(function () {});
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
