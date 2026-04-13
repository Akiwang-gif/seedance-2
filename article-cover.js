/**
 * Card / OG cover URL: saved imageUrl first, else first image in body, else contentBlocks.
 * Parses src, srcset, quoted/unquoted src; decodes basic HTML entities in URLs.
 */
(function (global) {
  function decodeUrlEntities(u) {
    return String(u || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  function firstUrlFromSrcset(srcset) {
    if (!srcset) return '';
    var part = String(srcset).split(',')[0].trim();
    var m = part.match(/^(\S+)/);
    return m ? decodeUrlEntities(m[1]) : '';
  }

  function firstImgSrcFromHtml(html) {
    if (!html) return '';
    var re = /<img\b[^>]*>/gi;
    var s = String(html);
    var tag;
    while ((tag = re.exec(s)) !== null) {
      var t = tag[0];
      var d = t.match(/\bsrc\s*=\s*"([^"]*)"/i);
      var sq = t.match(/\bsrc\s*=\s*'([^']*)'/i);
      var uq = t.match(/\bsrc\s*=\s*([^\s>]+)/i);
      var u = '';
      if (d && d[1]) u = decodeUrlEntities(d[1]);
      else if (sq && sq[1]) u = decodeUrlEntities(sq[1]);
      else if (uq && uq[1]) u = decodeUrlEntities(uq[1]);
      if (!u) {
        var ss = t.match(/\bsrcset\s*=\s*"([^"]+)"/i) || t.match(/\bsrcset\s*=\s*'([^']+)'/i);
        if (ss && ss[1]) u = firstUrlFromSrcset(ss[1]);
      }
      if (u) return u;
    }
    return '';
  }

  function articleCoverImageUrl(article) {
    if (!article) return '';
    var explicit = String(article.imageUrl || '').trim();
    if (explicit) return explicit;
    var fromBody = firstImgSrcFromHtml(article.bodyHtml);
    if (fromBody) return fromBody;
    if (article.contentBlocks && article.contentBlocks.length) {
      for (var i = 0; i < article.contentBlocks.length; i++) {
        var b = article.contentBlocks[i];
        if (b && b.type === 'image' && b.url) {
          var u = String(b.url).trim();
          if (u) return u;
        }
      }
    }
    return '';
  }

  global.articleCoverImageUrl = articleCoverImageUrl;
})(typeof window !== 'undefined' ? window : this);
