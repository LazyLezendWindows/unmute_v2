import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), emit: vi.fn(), get: vi.fn(), toast: vi.fn() }));
vi.mock('../../src/services/api', () => ({ api: { get: mocks.get } }));
vi.mock('../../src/services/socket', () => ({ getSocket: () => ({ connected: true, emit: mocks.emit,
  on: (event: string, fn: (...args: any[]) => any) => mocks.handlers.set(event, fn), off: vi.fn() }) }));
vi.mock('../../src/stores/toast', () => ({ useToastStore: () => ({ error: mocks.toast, show: mocks.toast }) }));
import { useCallStore } from '../../src/stores/call';
class Stream {
  constructor(public tracks: any[] = []) {}
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  addTrack(track: any) { this.tracks.push(track); }
}
class Peer {
  static instances: Peer[] = [];
  connectionState = 'new';
  remoteDescription = null;
  ontrack: any;
  onicecandidate: any;
  onconnectionstatechange: any;
  addTrack = vi.fn();
  getSenders = vi.fn(() => []);
  close = vi.fn();
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'test' }));
  setLocalDescription = vi.fn();
  constructor() { Peer.instances.push(this); }
}
let media: ReturnType<typeof vi.fn>;
let track: { kind: string; stop: ReturnType<typeof vi.fn> };
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
beforeEach(() => {
  vi.useFakeTimers(); setActivePinia(createPinia()); mocks.handlers.clear(); mocks.emit.mockClear(); mocks.toast.mockClear();
  mocks.get.mockResolvedValue({ data: { data: { iceServers: [] } } });
  Peer.instances = [];
  vi.stubGlobal('MediaStream', Stream); vi.stubGlobal('RTCPeerConnection', Peer);
  track = { kind: 'audio', stop: vi.fn() };
  media = vi.fn().mockResolvedValue(new Stream([track]));
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: media } });
});
afterEach(() => { useCallStore().reset(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('call lifecycle', () => {
  it('honors mute and camera-off chosen while media permission is pending', async () => {
    let resolve!: (stream: Stream) => void;
    media.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const camera = { kind: 'video', stop: vi.fn(), enabled: true };
    const microphone = { kind: 'audio', stop: vi.fn(), enabled: true };
    const call = useCallStore(); const pending = call.start('conversation', 'video');
    call.toggleMute(); call.toggleCamera();
    resolve(new Stream([microphone, camera])); await pending;
    expect(microphone.enabled).toBe(false); expect(camera.enabled).toBe(false);
  });

  it('stops a camera opened by a flip that finishes after hangup', async () => {
    const camera = { kind: 'video', stop: vi.fn() };
    media.mockResolvedValueOnce(new Stream([camera]));
    const call = useCallStore(); await call.start('conversation', 'video');
    let resolve!: (stream: Stream) => void;
    media.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const fresh = { kind: 'video', stop: vi.fn() };
    const flip = call.flipCamera(); call.hangUp(); resolve(new Stream([fresh]));
    await expect(flip).resolves.toBe(false);
    expect(fresh.stop).toHaveBeenCalled(); expect(call.localStream).toBeNull();
  });
  it('stops a late microphone permission result after hangup without sending an invite', async () => {
    let resolve!: (stream: Stream) => void;
    media.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const call = useCallStore();
    const pending = call.start('conversation', 'voice');
    call.hangUp(); resolve(new Stream([track])); await pending;
    expect(track.stop).toHaveBeenCalled();
    expect(call.localStream).toBeNull();
    expect(mocks.emit.mock.calls.some(c => c[1].type === 'invite')).toBe(false);
  });
  it('does not recreate a cancelled call after ICE configuration resolves', async () => {
    let resolve!: (value: unknown) => void;
    mocks.get.mockReturnValueOnce(new Promise(r => { resolve = r; }));
    const call = useCallStore(); const pending = call.start('conversation', 'voice');
    await flush(); call.hangUp(); resolve({ data: { data: { iceServers: [] } } }); await pending;
    expect(Peer.instances).toHaveLength(0);
    expect(call.status).toBe('ended');
  });
  it('cleans up when peer construction fails', async () => {
    vi.stubGlobal('RTCPeerConnection', class { constructor() { throw new Error('Unsupported connection'); } });
    const call = useCallStore(); await call.start('conversation', 'voice');
    expect(call.status).toBe('ended'); expect(track.stop).toHaveBeenCalled();
  });
  it('receives tracks even if the browser omits the streams array', async () => {
    const call = useCallStore(); await call.start('conversation', 'voice');
    Peer.instances[0].ontrack({ streams: [], track });
    expect(call.remoteStream?.getTracks()).toEqual([track]);
  });
  it('ends an unanswered connection attempt and releases media', async () => {
    const call = useCallStore(); call.bindSocket(); await call.start('conversation', 'voice');
    mocks.handlers.get('call:signal')!({ type: 'accept', conversationId: 'conversation' }); await flush();
    expect(call.status).toBe('connecting');
    await vi.advanceTimersByTimeAsync(30000);
    expect(call.status).toBe('ended'); expect(track.stop).toHaveBeenCalled();
    expect(mocks.emit).toHaveBeenCalledWith('call:signal', expect.objectContaining({ type: 'end' }));
  });
  it('stops media when the signaling connection disconnects', async () => {
    const call = useCallStore(); call.bindSocket(); await call.start('conversation', 'voice');
    mocks.handlers.get('disconnect')!();
    expect(call.status).toBe('ended'); expect(track.stop).toHaveBeenCalled();
  });
});
