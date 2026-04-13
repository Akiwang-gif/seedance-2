/**
 * Resolve article thumbnail / OG image: first real <img src> in bodyHtml,
 * then contentBlocks image, then saved imageUrl. Skips empty src and supports unquoted src.
 */
(function (global) {
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
      if (d && d[1]) u = d[1].trim();
      else if (sq && sq[1]) u = sq[1].trim();
      else if (uq && uq[1]) u = uq[1].trim();
      if (u) return u;
    }
    return '';
  }

  function articleCoverImageUrl(article) {
    if (!article) return '';
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
    return String(article.imageUrl || '').trim();
  }

  global.articleCoverImageUrl = articleCoverImageUrl;
})(typeof window !== 'undefined' ? window : this);
