import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

type Props = { roomId: string; socketId: string; api: string };
export default function MediaRoom({ roomId, socketId, api }: Props) {
  const [connection, setConnection] = useState<{url:string;token:string}|null>(null);
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
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
  if (!enabled) return <div className="media-start"><button onClick={() => setEnabled(true)}>Join voice &amp; video</button><small>Camera and microphone permissions will be requested.</small></div>;
  if (error) return <div className="media-start" role="alert">{error} <button onClick={() => {setEnabled(false);setConnection(null);}}>Retry</button></div>;
  if (!connection) return <div className="media-start">Connecting to media…</div>;
  return <div className="media-live" data-lk-theme="default">
    <LiveKitRoom token={connection.token} serverUrl={connection.url} connect={true} audio={true} video={true}
      onDisconnected={() => {setEnabled(false);setConnection(null);}} onError={e => setError(e.message)}>
      <VideoConference />
    </LiveKitRoom>
  </div>;
}
