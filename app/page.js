'use client';

import { useState, useCallback, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';

/** 移动端用：卡片占位图（渐变 + 播放图标），避免视频未加载时一片灰 */
const GALLERY_POSTER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9" fill="none"><rect width="16" height="9" fill="url(%23g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="%23e8e8ed"/><stop offset="1" stop-color="%23a0a0a8"/></linearGradient></defs><path d="M6 2.5v4l3.5-2-3.5-2z" fill="%23818cf8" opacity="0.9"/></svg>'
  );

const GALLERY_VIDEOS = [
  { src: '/演唱会.mp4', label: 'Concert' },
  { src: '/厨师.mp4', label: 'Chef' },
  { src: '/唱片.mp4', label: 'Record' },
  { src: '/胶片.mp4', label: 'Film' },
  { src: '/拍摄.mp4', label: 'Shooting' },
  { src: '/樱花.mp4', label: 'Cherry blossoms' },
  { src: '/吃饭.mp4', label: 'Dining' },
  { src: '/花开.mp4', label: 'Bloom' },
];

const FAQ_ITEMS = [
  { q: 'What is Seedance-2?', a: 'Seedance-2 is an AI video tool at seedance-2.info. It offers image-to-video so you can turn still images into short clips quickly for fun or content without complex software.' },
  { q: 'Can I use my own image?', a: 'Yes. Upload an image and describe the motion or scene. Supported formats are PNG, JPG, and WEBP. Resolution options are listed in the upload area.' },
  { q: 'How long does generation take?', a: 'Usually 1–2 minutes per video. Duration and resolution can affect this. You\'ll see a message when generation is in progress and when it\'s done.' },
  { q: 'Is Seedance-2 free?', a: 'You can try Seedance-2 and create videos with the options on the site. Some features or higher quality may require sign-in or credits. Check the pricing or plan info after signing in.' },
  { q: 'What is Seedance Video?', a: '"Seedance Video" means videos created with Seedance AI tools—including Seedance-2. When we say "create a Seedance Video," we mean using this site to generate AI videos from your images.' },
];

function GalleryItem({ src, label }) {
  const videoRef = useRef(null);
  const handleMouseEnter = useCallback((e) => e.target.play().catch(() => {}), []);
  const handleMouseLeave = useCallback((e) => {
    e.target.pause();
    e.target.currentTime = 0;
  }, []);
  const handleTap = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, []);
  return (
    <div className="gallery-item" onClick={handleTap} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleTap()} aria-label={`Play ${label}`}>
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
        poster={GALLERY_POSTER}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      />
      <div className="gallery-overlay"><p>{label}</p></div>
    </div>
  );
}

export default function HomePage() {
  const [activeCreator, setActiveCreator] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const [i2vImageBase64, setI2vImageBase64] = useState(null);
  const [i2vImagePreview, setI2vImagePreview] = useState('');
  const [i2vUploadName, setI2vUploadName] = useState('');
  const [i2vStatus, setI2vStatus] = useState('');
  const [i2vLoading, setI2vLoading] = useState(false);
  const [i2vResultUrl, setI2vResultUrl] = useState(null);
  const [i2vPrompt, setI2vPrompt] = useState('');
  const [i2vImageSize, setI2vImageSize] = useState('1280x720');
  const [i2vGenerating, setI2vGenerating] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { data: session, status } = useSession();

  const closeNav = useCallback(() => setNavOpen(false), []);

  const showHome = useCallback((e) => {
    if (e) e.preventDefault();
    setActiveCreator(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /** 先回到首页，再平滑滚动到指定区块（等 DOM 更新后再滚） */
  const scrollToSection = useCallback((e, sectionId) => {
    e.preventDefault();
    setActiveCreator(null);
    const scroll = () => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    requestAnimationFrame(() => setTimeout(scroll, 80));
  }, []);

  const showCreator = useCallback((type, e) => {
    if (e) e.preventDefault();
    setActiveCreator(type);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const toggleFaq = useCallback((index) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  }, []);

  const handleI2vImageChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setI2vImageBase64(reader.result);
      setI2vImagePreview(reader.result);
      setI2vUploadName(f.name);
    };
    reader.readAsDataURL(f);
  }, []);

  const pollVideoStatus = useCallback(async (requestId) => {
    const res = await fetch('/api/video/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    });
    const data = await res.json();
    if (data.status === 'Succeed' && data.results?.videos?.[0]) return data.results.videos[0].url;
    if (data.status === 'Failed') throw new Error(data.reason || 'Generation failed');
    setI2vStatus(data.status || 'Waiting…');
    await new Promise((r) => setTimeout(r, 3000));
    return pollVideoStatus(requestId);
  }, []);

  const generateImage2Video = useCallback(async () => {
    if (!i2vPrompt.trim()) { alert('Please enter a prompt.'); return; }
    if (!i2vImageBase64) { alert('Please upload an image first.'); return; }
    setI2vGenerating(true);
    setI2vLoading(true);
    setI2vResultUrl(null);
    setI2vStatus('Submitting…');
    try {
      const res = await fetch('/api/video/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Wan-AI/Wan2.2-I2V-A14B',
          prompt: i2vPrompt.trim(),
          image_size: i2vImageSize,
          image: i2vImageBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'Submit failed');
      const requestId = json.requestId;
      if (!requestId) throw new Error('No requestId returned');
      setI2vStatus('Generating…');
      const videoUrl = await pollVideoStatus(requestId);
      setI2vResultUrl(videoUrl);
      setI2vLoading(false);
    } catch (err) {
      alert('Error: ' + (err?.message || String(err)));
      setI2vLoading(false);
    } finally {
      setI2vGenerating(false);
    }
  }, [i2vPrompt, i2vImageBase64, i2vImageSize, pollVideoStatus]);

  const showHomePage = activeCreator === null;

  return (
    <>
      <nav className={navOpen ? 'nav-open' : ''} aria-label="Main navigation">
        <div className="logo">Seedance<span className="brand">-2</span></div>
        <button
          type="button"
          className="nav-toggle"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
        >
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
          <span className="nav-toggle-bar" />
        </button>
        <div className="nav-links">
          <a href="#" role="button" onClick={(e) => { closeNav(); showHome(e); }}>Home</a>
          <a href="#gallery" onClick={(e) => { closeNav(); scrollToSection(e, 'gallery'); }}>Gallery</a>
          <a href="#how-it-works" onClick={(e) => { closeNav(); scrollToSection(e, 'how-it-works'); }}>How it works</a>
          <a href="#faq" onClick={(e) => { closeNav(); scrollToSection(e, 'faq'); }}>FAQ</a>
          {status === 'loading' ? (
            <span className="nav-user-email">Loading…</span>
          ) : session?.user ? (
            <span className="nav-user">
              <span className="nav-user-email" title={session.user.email}>{session.user.email}</span>
              {session.user.image && <img src={session.user.image} alt="" className="nav-user-avatar" />}
              <button type="button" className="btn-login btn-logout" onClick={() => { closeNav(); signOut(); }}>Sign out</button>
            </span>
          ) : (
            <button type="button" className="btn-login" onClick={() => { closeNav(); signIn('google', { callbackUrl: '/' }); }}>Sign in with Google</button>
          )}
        </div>
      </nav>

      {showHomePage && (
        <>
          <div className="page-bg-stars" aria-hidden="true">
            <img src="/background-stars.png" alt="Starry sky and nebula background, fading to transparent from top to bottom" className="page-bg-stars-img" />
          </div>
          <div id="homePage">
          <header className="hero">
            <p className="hero-badge">Seedance AI · seedance-2.info</p>
            <h1>Seedance Video<br />Imagine. Create.</h1>
            <p className="hero-sub">Image to video</p>
            <div className="keyword-row" aria-label="Brand and feature keywords">
              <span className="keyword-tag"><strong>Seedance Video</strong></span>
              <span className="keyword-tag"><strong>Seedance-2</strong></span>
              <span className="keyword-tag"><strong>Seedance AI</strong></span>
              <span className="keyword-tag">Image to video</span>
            </div>
          </header>

          <section className="features features--single" id="features">
            <article className="feature-card feature-card--hero" onClick={() => showCreator('image2video')} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && showCreator('image2video')}>
              <div className="feature-icon">🖼️</div>
              <h3>Image to Video</h3>
              <p>Turn still images into motion</p>
            </article>
          </section>

          <section className="gallery-section" id="gallery" aria-labelledby="gallery-title">
            <div className="gallery-header">
              <h2 id="gallery-title">Featured creations</h2>
              <p>Seedance Video by the Seedance-2 community</p>
            </div>
            <div className="gallery-grid">
              {GALLERY_VIDEOS.map((v, i) => (
                <GalleryItem key={i} src={v.src} label={v.label} />
              ))}
            </div>
          </section>

          <section className="content-section" id="how-it-works" aria-labelledby="how-title">
            <h2 id="how-title">How to create AI videos with Seedance-2</h2>
            <p className="section-lead">Three simple steps to turn your images into Seedance Video.</p>
            <ol className="steps-list">
              <li><h3>Choose Image to Video</h3><p>Click Image to Video on the home page.</p></li>
              <li><h3>Add your image and prompt</h3><p>Upload an image and describe the motion or scene you want.</p></li>
              <li><h3>Generate and download</h3><p>Click Generate. Your video is created in about 1–2 minutes. Preview it, then download to use in your projects.</p></li>
            </ol>
          </section>

          <section className="content-section" id="features-intro" aria-labelledby="features-title">
            <h2 id="features-title">Why Seedance-2</h2>
            <p className="section-lead">Seedance-2 at seedance-2.info is your go-to Seedance AI video tool for fun, quick creations.</p>
            <div className="features-intro">
              <p>Seedance-2 lets you create AI videos from a single image. No complex setup—upload your image, describe the motion, and generate.</p>
            </div>
            <ul className="feature-list">
              <li><strong>Image to video</strong><span>Upload a photo and bring it to life with motion.</span></li>
              <li><strong>Simple and fast</strong><span>Clean interface, clear options, and results in about 1–2 minutes.</span></li>
            </ul>
          </section>

          <section className="content-section" id="faq" aria-labelledby="faq-title">
            <h2 id="faq-title">Frequently asked questions</h2>
            <p className="section-lead">Quick answers about Seedance-2 and Seedance Video.</p>
            <ul className="faq-list">
              {FAQ_ITEMS.map((item, i) => (
                <li key={i} className={`faq-item ${openFaq === i ? 'is-open' : ''}`}>
                  <button type="button" aria-expanded={openFaq === i} onClick={() => toggleFaq(i)}>{item.q}</button>
                  <div className="faq-answer">{item.a}</div>
                </li>
              ))}
            </ul>
          </section>
          </div>
        </>
      )}

      {/* Image to Video creator */}
      <div id="image2videoPage" className={`creator-page ${activeCreator === 'image2video' ? 'active' : ''}`} style={{ display: activeCreator === 'image2video' ? undefined : 'none' }}>
        <div className="preview-section">
          {!i2vLoading && !i2vResultUrl && (
            <div className="preview-placeholder">
              <div className="icon">🖼️</div>
              <p>Preview</p>
            </div>
          )}
          {i2vLoading && (
            <div className="preview-loading">
              <div className="icon">⏳</div>
              <p>Generating video…</p>
              <p className="preview-loading-hint">{i2vStatus}</p>
            </div>
          )}
          {i2vResultUrl && !i2vLoading && (
            <div><video src={i2vResultUrl} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 12 }} /></div>
          )}
        </div>
        <div className="controls-section">
          <a href="#" className="btn-back" onClick={(e) => { e.preventDefault(); showHome(e); }}>← Back</a>
          <h2>Image to Video</h2>
          <div className="input-group">
            <label>Prompt</label>
            <textarea id="i2vPrompt" placeholder="Describe the motion or scene..." rows={3} value={i2vPrompt} onChange={(e) => setI2vPrompt(e.target.value)} />
          </div>
          <div className="input-group">
            <label>Image</label>
            <input type="file" id="i2vImageInput" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={handleI2vImageChange} />
            <div className="upload-area" onClick={() => document.getElementById('i2vImageInput')?.click()}>
              <div className="icon">📤</div>
              <p>{i2vUploadName || 'Click to upload image (PNG, JPG, WEBP)'}</p>
              {i2vImagePreview && <img src={i2vImagePreview} alt="" style={{ display: 'block', maxWidth: 120, maxHeight: 80, marginTop: 8, borderRadius: 8 }} />}
            </div>
          </div>
          <div className="settings-grid">
            <div className="setting-item">
              <label>Resolution (image_size)</label>
              <select id="i2vImageSize" value={i2vImageSize} onChange={(e) => setI2vImageSize(e.target.value)}>
                <option value="1280x720">1280×720 (landscape)</option>
                <option value="720x1280">720×1280 (portrait)</option>
                <option value="960x960">960×960 (square)</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn-generate" id="i2vGenerateBtn" onClick={generateImage2Video} disabled={i2vGenerating}>Generate video</button>
        </div>
      </div>

      <footer className="site-footer">
        <p className="footer-disclaimer">Seedance-2 is an independent platform and is not affiliated with Bytedance or its products.</p>
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="logo-text">Seedance<span>-2</span></div>
            <p className="copyright">Copyright seedance-2.info © 2026 — All rights reserved.</p>
          </div>
          <div className="footer-columns">
            <div className="footer-col">
              <h4>Links</h4>
              <ul>
                <li><a href="#contact" onClick={(e) => scrollToSection(e, 'contact')}>Contact Us</a></li>
                <li><a href="#refund" onClick={(e) => scrollToSection(e, 'refund')}>Refund Policy</a></li>
                <li><a href="#about" onClick={(e) => scrollToSection(e, 'about')}>About Us</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><a href="#terms" onClick={(e) => scrollToSection(e, 'terms')}>Terms of Service</a></li>
                <li><a href="#privacy" onClick={(e) => scrollToSection(e, 'privacy')}>Privacy Policy</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Language</h4>
              <p className="lang-label">English</p>
            </div>
          </div>
        </div>
      </footer>

      {/* 法律与说明区块：仅在点击页脚链接后跳转显示 */}
      <div className="legal-pages">
        <section className="content-section legal-section" id="terms" aria-labelledby="terms-title">
          <h2 id="terms-title">Terms of Service</h2>
          <p className="section-lead">Last updated: 2026. By using seedance-2.info you agree to these terms.</p>
          <div className="legal-block">
            <h3>1. Use of Service</h3>
            <p>Seedance-2 at seedance-2.info provides AI video creation tools. You may use the service for personal or commercial projects in line with these terms and applicable law.</p>
            <h3>2. Your Content</h3>
            <p>You keep ownership of content you upload and create. You grant us a limited license to process and generate outputs.</p>
            <h3>3. Acceptable Use</h3>
            <p>You must not use the service for illegal, harmful, or abusive purposes.</p>
            <h3>4. Disclaimer</h3>
            <p>The service is provided &quot;as is.&quot; We do not guarantee uninterrupted or error-free operation.</p>
            <h3>5. Changes</h3>
            <p>We may update these terms. Continued use after changes constitutes acceptance.</p>
          </div>
        </section>
        <section className="content-section legal-section" id="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Privacy Policy</h2>
          <p className="section-lead">How we collect, use, and protect your information at seedance-2.info.</p>
          <div className="legal-block">
            <h3>1. Information We Collect</h3>
            <p>We may collect information you provide and usage data to operate and improve the service.</p>
            <h3>2. How We Use It</h3>
            <p>We use this information to provide and improve Seedance-2, to communicate with you, and to ensure security and compliance.</p>
            <h3>3. Sharing</h3>
            <p>We do not sell your personal data. We may share data with service providers under strict confidentiality, or when required by law.</p>
            <h3>4. Security</h3>
            <p>We use industry-standard measures to protect your data.</p>
            <h3>5. Your Rights</h3>
            <p>You may request access, correction, or deletion of your personal data where applicable.</p>
            <h3>6. Updates</h3>
            <p>We may update this policy from time to time. Continued use means you accept the updated policy.</p>
          </div>
        </section>
        <section className="content-section legal-section" id="contact">
          <h2 id="contact-title">Contact Us</h2>
          <p className="section-lead">For support or inquiries, please email us or use the contact form when available.</p>
        </section>
        <section className="content-section legal-section" id="refund">
          <h2 id="refund-title">Refund Policy</h2>
          <p className="section-lead">Refund eligibility and process for paid plans will be described here. Contact us for specific cases.</p>
        </section>
        <section className="content-section legal-section" id="about">
          <h2 id="about-title">About Us</h2>
          <p className="section-lead">Seedance-2 is an AI video creation platform at seedance-2.info, offering image-to-video for creators worldwide.</p>
        </section>
      </div>

    </>
  );
}
