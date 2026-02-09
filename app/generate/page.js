'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

export default function GeneratePage() {
  const [activeTab, setActiveTab] = useState('text2video');
  const [i2vImageBase64, setI2vImageBase64] = useState(null);
  const [i2vUploadName, setI2vUploadName] = useState('');
  const [i2vStatus, setI2vStatus] = useState('');
  const [i2vLoading, setI2vLoading] = useState(false);
  const [i2vResultUrl, setI2vResultUrl] = useState(null);
  const [i2vPrompt, setI2vPrompt] = useState('');
  const [i2vSize, setI2vSize] = useState('1280x720');
  const [i2vGenerating, setI2vGenerating] = useState(false);
  const [effVideoUrl, setEffVideoUrl] = useState(null);
  const [effUploadName, setEffUploadName] = useState('');

  const handleI2vImageChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setI2vImageBase64(r.result);
      setI2vUploadName(f.name);
    };
    r.readAsDataURL(f);
  }, []);

  const pollStatus = useCallback(async (requestId) => {
    const res = await fetch('/api/video/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId }),
    });
    const d = await res.json();
    if (d.status === 'Succeed' && d.results?.videos?.[0]) return d.results.videos[0].url;
    if (d.status === 'Failed') throw new Error(d.reason || 'Failed');
    setI2vStatus(d.status || 'Waiting…');
    await new Promise((r) => setTimeout(r, 3000));
    return pollStatus(requestId);
  }, []);

  const generateI2V = useCallback(async () => {
    if (!i2vPrompt.trim()) { alert('Please enter a prompt.'); return; }
    if (!i2vImageBase64) { alert('Please upload an image.'); return; }
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
          image_size: i2vSize,
          image: i2vImageBase64,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.message || 'Submit failed');
      const id = json.requestId;
      if (!id) throw new Error('No requestId');
      setI2vStatus('Generating…');
      const url = await pollStatus(id);
      setI2vResultUrl(url);
      setI2vLoading(false);
    } catch (err) {
      alert('Error: ' + (err?.message || err));
      setI2vLoading(false);
    } finally {
      setI2vGenerating(false);
    }
  }, [i2vPrompt, i2vImageBase64, i2vSize, pollStatus]);

  const handleEffVideoChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setEffVideoUrl(URL.createObjectURL(f));
    setEffUploadName(f.name);
  }, []);

  return (
    <>
      <header className="page-header">
        <div className="page-header-inner">
          <Link href="/">← Seedance<span>-2</span></Link>
          <Link href="/">Home</Link>
        </div>
      </header>

      <div className="tabs">
        <button type="button" className={`tab ${activeTab === 'text2video' ? 'active' : ''}`} onClick={() => setActiveTab('text2video')}>Text to Video</button>
        <button type="button" className={`tab ${activeTab === 'image2video' ? 'active' : ''}`} onClick={() => setActiveTab('image2video')}>Image to Video</button>
        <button type="button" className={`tab ${activeTab === 'effects' ? 'active' : ''}`} onClick={() => setActiveTab('effects')}>Video effects</button>
      </div>

      {activeTab === 'text2video' && (
        <div className="creator-page active">
          <div className="preview-section">
            <div className="preview-placeholder"><div className="icon">🎬</div><p>Video preview</p></div>
          </div>
          <div className="controls-section">
            <h2>Text to Video</h2>
            <div className="input-group">
              <label>Prompt</label>
              <textarea placeholder="e.g. A cat dancing on a rooftop under moonlight..." />
            </div>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Duration</label>
                <div className="slider-container">
                  <input type="range" min="3" max="10" defaultValue={5} className="slider" id="t2vDuration" />
                  <span className="slider-value">5 sec</span>
                </div>
              </div>
              <div className="setting-item">
                <label>Resolution</label>
                <select defaultValue="1080p"><option>720p</option><option>1080p</option><option>4K</option></select>
              </div>
              <div className="setting-item">
                <label>Style</label>
                <select><option>Realistic</option><option>Anime</option><option>Cyberpunk</option><option>Vintage</option></select>
              </div>
              <div className="setting-item">
                <label>Motion</label>
                <div className="slider-container">
                  <input type="range" min="1" max="10" defaultValue={5} className="slider" />
                  <span className="slider-value">Medium</span>
                </div>
              </div>
            </div>
            <button type="button" className="btn-generate" onClick={() => alert('Video is generating. This may take 1–2 minutes.')}>Generate video</button>
          </div>
        </div>
      )}

      {activeTab === 'image2video' && (
        <div className="creator-page active">
          <div className="preview-section">
            {!i2vLoading && !i2vResultUrl && <div className="preview-placeholder"><div className="icon">🖼️</div><p>Preview</p></div>}
            {i2vLoading && <div className="preview-loading"><div className="icon">⏳</div><p>Generating…</p><p className="preview-loading-hint">{i2vStatus}</p></div>}
            {i2vResultUrl && !i2vLoading && <div><video src={i2vResultUrl} controls playsInline /></div>}
          </div>
          <div className="controls-section">
            <h2>Image to Video</h2>
            <div className="input-group">
              <label>Prompt</label>
              <textarea id="i2vPrompt" placeholder="Describe the motion or scene..." rows={3} value={i2vPrompt} onChange={(e) => setI2vPrompt(e.target.value)} />
            </div>
            <div className="input-group">
              <label>Image</label>
              <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} id="i2vImageInput" onChange={handleI2vImageChange} />
              <div className="upload-area" onClick={() => document.getElementById('i2vImageInput')?.click()}>
                <div className="icon">📤</div>
                <p>{i2vUploadName || 'Click to upload image (PNG, JPG, WEBP)'}</p>
              </div>
            </div>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Resolution</label>
                <select id="i2vSize" value={i2vSize} onChange={(e) => setI2vSize(e.target.value)}>
                  <option value="1280x720">1280×720</option>
                  <option value="720x1280">720×1280</option>
                  <option value="960x960">960×960</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn-generate" id="i2vBtn" onClick={generateI2V} disabled={i2vGenerating}>Generate video</button>
          </div>
        </div>
      )}

      {activeTab === 'effects' && (
        <div className="creator-page active">
          <div className="preview-section">
            {!effVideoUrl && <div className="preview-placeholder"><div className="icon">🎨</div><p>Preview</p></div>}
            {effVideoUrl && <div><video src={effVideoUrl} controls playsInline /></div>}
          </div>
          <div className="controls-section">
            <h2>Video effects</h2>
            <div className="input-group">
              <label>Video</label>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: 'none' }} id="effVideoInput" onChange={handleEffVideoChange} />
              <div className="upload-area" onClick={() => document.getElementById('effVideoInput')?.click()}>
                <div className="icon">🎥</div>
                <p>{effUploadName || 'Click to upload video (MP4, WebM, MOV)'}</p>
              </div>
            </div>
            <div className="settings-grid">
              <div className="setting-item">
                <label>Filter</label>
                <select><option>None</option><option>Vintage</option><option>Cyberpunk</option><option>B&W</option></select>
              </div>
              <div className="setting-item">
                <label>Speed</label>
                <select defaultValue="1x"><option>0.5x</option><option>1x</option><option>1.5x</option><option>2x</option></select>
              </div>
            </div>
            <button type="button" className="btn-generate" onClick={() => alert('Effects applied. (Demo)')}>Apply effects</button>
          </div>
        </div>
      )}
    </>
  );
}
