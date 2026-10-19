import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

// V06_PHASE22C_POPOUT: Move one mounted media tree between windows.
// Moving the host DOM node does NOT create a second LiveKit connection.
type Props = { roomId: string; socketId: string; api: string };
export default function MediaRoom({ roomId, socketId, api }: Props) {
  const [connection, setConnection] = useState<{url:string;token:string}|null>(null);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [popped, setPopped] = useState(false);
  const [popError, setPopError] = useState('');
  const anchor = useRef<HTMLDivElement>(null);
  const popup = useRef<Window|null>(null);
  const host = useRef<HTMLDivElement|null>(null);
  if (!host.current) {
    host.current = document.createElement('div');
    host.current.className = 'media-popout-host';
  }
  function restore() {
    if (anchor.current && host.current && host.current.parentNode !== anchor.current) anchor.current.appendChild(host.current);
    popup.current = null;
    setPopped(false);
  }
  useEffect(() => {
    if (anchor.current && host.current && !host.current.parentNode) anchor.current.appendChild(host.current);
    return () => {
      const win = popup.current;
      if (win && !win.closed) win.close();
      host.current?.remove();
    };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError('');
    fetch(api + '/api/livekit/token', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({roomId, socketId}), signal: controller.signal
    }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Media unavailable'); return data; })
      .then(setConnection).catch(e => { if (!controller.signal.aborted) setError(String(e.message || e)); });
    return () => controller.abort();
  }, [enabled, roomId, socketId, api]);
  function popOut() {
    if (popup.current && !popup.current.closed) { popup.current.focus(); return; }
    const win = window.open('', 'tabletop-media-' + roomId, 'popup=yes,width=1000,height=720,resizable=yes,scrollbars=yes');
    if (!win) { setPopError('The browser blocked the pop-out. Allow pop-ups for this site and try again.'); return; }
    try {
      win.document.title = 'TABLETOP — Voice, video & chat';
      win.document.documentElement.style.background = '#101722';
      win.document.body.style.margin = '0';
      win.document.body.style.minHeight = '100vh';
      win.document.body.className = 'media-popout-window';
      // Include Vite styles, LiveKit styles, and the application's CSS.
      document.head.querySelectorAll('link[rel="stylesheet"],style').forEach(el => win.document.head.appendChild(el.cloneNode(true)));
      const base = win.document.createElement('base'); base.href = document.baseURI; win.document.head.appendChild(base);
      const onClose = () => { restore(); };
      win.addEventListener('pagehide', onClose, { once: true });
      win.addEventListener('beforeunload', onClose, { once: true });
      win.document.body.appendChild(host.current!);
      popup.current = win;
      setPopped(true);
      setPopError('');
      win.focus();
    } catch (e) {
      restore(); win.close(); setPopError('Unable to open media window: ' + String(e));
    }
  }
  function returnToMain() {
    const win = popup.current;
    restore();
    if (win && !win.closed) win.close();
  }
  const content = !enabled ? <div className="media-start"><button onClick={() => setEnabled(true)}>Join voice &amp; video</button><small>Camera and microphone permissions will be requested.</small></div>
    : error ? <div className="media-start" role="alert">{error} <button onClick={() => {setEnabled(false);setConnection(null);}}>Retry</button></div>
    : !connection ? <div className="media-start">Connecting to media…</div>
    : <div className="media-shell" data-lk-theme="default"><div className="media-heading"><div className="media-heading-actions">{popped && <button type="button" onClick={returnToMain}>Return to tabletop</button>}<button type="button" className="media-collapse-toggle" onClick={() => setCollapsed(v => !v)} aria-expanded={!collapsed}>{collapsed ? 'Show video' : 'Hide video'}</button></div></div><div className={'media-live' + (collapsed ? ' media-collapsed' : '')}>
      <LiveKitRoom token={connection.token} serverUrl={connection.url} connect={true} audio={true} video={true}
        onDisconnected={() => {setEnabled(false);setConnection(null);}} onError={e => setError(e.message)}>
        <VideoConference />
      </LiveKitRoom>
    </div></div>;
  return <div className="media-popout-controller">
    <div className="media-popout-toolbar"><span>{popped ? 'Voice, video & chat are in a separate window.' : 'Voice, video & chat'}</span><button type="button" onClick={popped ? returnToMain : popOut}>{popped ? 'Bring media back' : 'Pop out media ↗'}</button></div>
    {popError && <p className="error" role="alert">{popError}</p>}
    <div ref={anchor} className={'media-popout-anchor' + (popped ? ' media-is-popped' : '')}/>
    {host.current && createPortal(content, host.current)}
  </div>;
}
