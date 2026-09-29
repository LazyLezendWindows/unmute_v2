import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { Socket } from 'socket.io-client';
import { api } from '../services/api';
import { getSocket } from '../services/socket';
import { useToastStore } from './toast';

export type CallMode = 'voice' | 'video';
/**
 * idle → outgoing (ringing them) or incoming (they're ringing you) → connecting (both said yes,
 * WebRTC is finding a route) → active (media flowing) → ended (shown briefly) → idle.
 */
export type CallStatus = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active' | 'ended';

interface Signal {
  conversationId: string;
  from: string;
  type: string;
  payload?: any;
}

export type CallEffect = 'none' | 'warm' | 'vivid' | 'soft' | 'mono';

/** Camera looks, drawn onto each frame before it's sent, so both people see them. */
export const EFFECTS: { id: CallEffect; label: string; filter: string }[] = [
  { id: 'none', label: 'Natural', filter: 'none' },
  { id: 'warm', label: 'Warm', filter: 'sepia(0.22) saturate(1.25) brightness(1.04)' },
  { id: 'vivid', label: 'Vivid', filter: 'saturate(1.6) contrast(1.08)' },
  { id: 'soft', label: 'Soft', filter: 'brightness(1.08) contrast(0.9) saturate(1.1) blur(0.6px)' },
  { id: 'mono', label: 'B&W', filter: 'grayscale(1) contrast(1.1)' },
];

/** How long an unanswered call rings before it gives up. */
const RING_MS = 45_000;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/**
 * One call at a time, kept outside any screen so it survives moving between pages. Audio and video
 * flow directly between the two browsers (WebRTC); the socket only carries the setup messages.
 */
export const useCallStore = defineStore('call', () => {
  const status = ref<CallStatus>('idle');
  const mode = ref<CallMode>('video');
  const conversationId = ref<string | null>(null);
  /** Why the call ended, shown on the call screen for a moment ("No answer", "Call declined"…). */
  const endReason = ref('');
  const localStream = shallowRef<MediaStream | null>(null);
  const remoteStream = shallowRef<MediaStream | null>(null);
  const startedAt = ref<number | null>(null);
  const muted = ref(false);
  const cameraOff = ref(false);
  const facing = ref<'user' | 'environment'>('user');
  /** Reactions the other person sent, for the call screen to float up. */
  const incomingReaction = ref<{ emoji: string; at: number } | null>(null);
  const effect = ref<CallEffect>('none');

  const inCall = computed(() => status.value !== 'idle' && status.value !== 'ended');

  let generation = 0;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let pc: RTCPeerConnection | null = null;
  let pendingIce: RTCIceCandidateInit[] = [];
  let ringTimer: ReturnType<typeof setTimeout> | undefined;
  let boundSocket: Socket | null = null;
  let iceServers: RTCIceServer[] | null = null;
  /** The raw camera, and (while an effect is on) the canvas that repaints it with the effect. */
  let cameraTrack: MediaStreamTrack | null = null;
  let effectTrack: MediaStreamTrack | null = null;
  let effectTimer: ReturnType<typeof setInterval> | undefined;
  let effectSource: HTMLVideoElement | null = null;
  let effectCtx: CanvasRenderingContext2D | null = null;

  async function useVideoTrack(track: MediaStreamTrack | null) {
    if (!track || !localStream.value) return;
    track.enabled = !cameraOff.value;
    await pc?.getSenders().find((s) => s.track?.kind === 'video')?.replaceTrack(track);
    localStream.value = new MediaStream([...localStream.value.getAudioTracks(), track]);
  }

  function stopEffect() {
    clearInterval(effectTimer);
    effectTimer = undefined;
    effectTrack?.stop();
    effectTrack = null;
    effectSource?.pause();
    effectSource = null;
    effectCtx = null;
  }

  /** Switches the camera look; returns false where the browser can't draw effects. */
  async function setEffect(next: CallEffect): Promise<boolean> {
    if (mode.value !== 'video' || !cameraTrack) return false;
    if (next === 'none') {
      stopEffect();
      effect.value = 'none';
      await useVideoTrack(cameraTrack);
      return true;
    }
    if (!effectTrack) {
      const settings = cameraTrack.getSettings();
      const canvas = document.createElement('canvas');
      canvas.width = settings.width || 640;
      canvas.height = settings.height || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx || !('filter' in ctx)) return false;
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = new MediaStream([cameraTrack]);
      await video.play().catch(() => undefined);
      effectSource = video;
      effectCtx = ctx;
      // A timer rather than animation frames, so the picture keeps moving while the tab is hidden.
      effectTimer = setInterval(() => {
        if (!effectCtx || !effectSource || effectSource.readyState < 2) return;
        effectCtx.drawImage(effectSource, 0, 0, canvas.width, canvas.height);
      }, 1000 / 30);
      effectTrack = canvas.captureStream(30).getVideoTracks()[0];
    }
    effectCtx!.filter = EFFECTS.find((e) => e.id === next)!.filter;
    effect.value = next;
    await useVideoTrack(effectTrack);
    return true;
  }

  function send(type: string, payload?: unknown) {
    if (conversationId.value) getSocket()?.emit('call:signal', { conversationId: conversationId.value, type, payload });
  }

  async function loadIceServers(): Promise<RTCIceServer[]> {
    if (iceServers) return iceServers;
    try {
      iceServers = (await api.get('/conversations/call-config')).data.data.iceServers;
    } catch {
      iceServers = FALLBACK_ICE;
    }
    return iceServers!.length ? iceServers! : FALLBACK_ICE;
  }

  /** Camera and/or microphone; throws a message the member can act on. */
  async function openMedia(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Calls need a secure (https) connection and a browser with camera access.');
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: mode.value === 'video' ? { facingMode: facing.value, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      return stream;
    } catch (err: any) {
      if (err?.name === 'NotAllowedError') {
        throw new Error(`Allow ${mode.value === 'video' ? 'camera and microphone' : 'microphone'} access in your browser to call.`);
      }
      if (err?.name === 'NotFoundError') {
        throw new Error(mode.value === 'video' ? 'No camera or microphone was found.' : 'No microphone was found.');
      }
      throw new Error("Couldn't start your camera or microphone.");
    }
  }

  async function createPeer(attempt = generation) {
    const servers = await loadIceServers();
    if (attempt !== generation || !inCall.value) return false;
    pc = new RTCPeerConnection({ iceServers: servers });
    const remote = new MediaStream();
    remoteStream.value = remote;
    localStream.value?.getTracks().forEach((track) => pc!.addTrack(track, localStream.value!));
    pc.ontrack = (event) => {
      const tracks = event.streams[0]?.getTracks() ?? [event.track];
      tracks.forEach((t) => remote.getTracks().includes(t) || remote.addTrack(t));
      // A new object so the screen's watcher re-attaches it.
      remoteStream.value = new MediaStream(remote.getTracks());
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) send('ice', event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      const state = pc?.connectionState;
      if (state === 'connected' && status.value !== 'active') {
        clearTimeout(connectTimer);
        status.value = 'active';
        startedAt.value = Date.now();
      } else if (state === 'failed') {
        send('end');
        finish("The call couldn't connect. Check your connection and try again.", true);
      }
    };
    return true;
  }

  function watchConnection() {
    clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      if (status.value !== 'connecting') return;
      send('end');
      finish("The call could not connect. Please try again on another network.", true);
    }, 30000);
  }

  async function acquireMedia(attempt: number) {
    const stream = await openMedia();
    if (attempt !== generation || !inCall.value) {
      stream.getTracks().forEach(track => track.stop());
      return false;
    }
    localStream.value = stream;
    cameraTrack = stream.getVideoTracks()[0] ?? null;
    return true;
  }

  async function flushIce() {
    for (const candidate of pendingIce) await pc?.addIceCandidate(candidate).catch(() => undefined);
    pendingIce = [];
  }

  /** Rings the other person in `id`. */
  async function start(id: string, callMode: CallMode) {
    if (inCall.value) return;
    reset();
    conversationId.value = id;
    mode.value = callMode;
    status.value = 'outgoing';
    const attempt = generation;
    try {
      if (!(await acquireMedia(attempt))) return;
      if (!getSocket()?.connected) throw new Error("You're offline. Reconnect and try again.");
      if (!(await createPeer(attempt))) return;
    } catch (err: any) {
      if (attempt === generation) finish(err.message || 'Unable to start the call.', true);
      return;
    }
    send('invite', { mode: callMode });
    ringTimer = setTimeout(() => {
      if (status.value === 'outgoing') {
        send('cancel');
        finish('No answer', false);
      }
    }, RING_MS);
  }

  /** Answers the incoming call. */
  async function accept() {
    if (status.value !== 'incoming') return;
    clearTimeout(ringTimer);
    status.value = 'connecting';
    const attempt = generation;
    watchConnection();
    try {
      if (!(await acquireMedia(attempt))) return;
      if (!getSocket()?.connected) throw new Error("You're offline. Reconnect and try again.");
      if (!(await createPeer(attempt))) return;
    } catch (err: any) {
      if (attempt === generation) {
        send('decline');
        finish(err.message || 'Unable to answer the call.', true);
      }
      return;
    }
    send('accept');
  }

  function decline() {
    if (status.value !== 'incoming') return;
    send('decline');
    finish('', false);
  }

  /** Hangs up, or stops ringing. */
  function hangUp() {
    if (status.value === 'outgoing') send('cancel');
    else if (inCall.value) send('end');
    finish('Call ended', false);
  }

  async function onSignal(signal: Signal) {
    const { type, payload } = signal;

    if (type === 'invite') {
      // Already on a call (or ringing): tell them, and don't disturb this one.
      if (inCall.value) {
        getSocket()?.emit('call:signal', { conversationId: signal.conversationId, type: 'busy' });
        return;
      }
      reset();
      conversationId.value = signal.conversationId;
      mode.value = payload?.mode === 'voice' ? 'voice' : 'video';
      status.value = 'incoming';
      ringTimer = setTimeout(() => status.value === 'incoming' && finish('', false), RING_MS);
      return;
    }

    // Everything else belongs to the current call only.
    if (signal.conversationId !== conversationId.value) return;

    switch (type) {
      case 'accept': {
        if (status.value !== 'outgoing') return;
        clearTimeout(ringTimer);
        status.value = 'connecting';
        watchConnection();
        // Peer was already created in start(); just make the offer.
        if (!pc) await createPeer();
        const offer = await pc!.createOffer();
        await pc!.setLocalDescription(offer);
        send('offer', offer);
        break;
      }
      case 'offer': {
        if (!pc) return;
        await pc.setRemoteDescription(payload);
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send('answer', answer);
        break;
      }
      case 'answer':
        await pc?.setRemoteDescription(payload);
        await flushIce();
        break;
      case 'ice':
        if (pc?.remoteDescription) await pc.addIceCandidate(payload).catch(() => undefined);
        else pendingIce.push(payload);
        break;
      case 'reaction':
        if (typeof payload?.emoji === 'string') incomingReaction.value = { emoji: payload.emoji.slice(0, 8), at: Date.now() };
        break;
      case 'decline':
        finish('Call declined', false);
        break;
      case 'busy':
        finish('They’re on another call', false);
        break;
      case 'cancel':
        finish(status.value === 'incoming' ? '' : 'Call ended', false);
        break;
      case 'end':
        finish('Call ended', false);
        break;
      case 'handled':
        // Answered or declined in another of your tabs.
        if (status.value === 'incoming') finish('', false);
        break;
    }
  }

  function sendReaction(emoji: string) {
    if (inCall.value) send('reaction', { emoji });
  }

  function toggleMute() {
    muted.value = !muted.value;
    localStream.value?.getAudioTracks().forEach((t) => (t.enabled = !muted.value));
  }

  function toggleCamera() {
    cameraOff.value = !cameraOff.value;
    localStream.value?.getVideoTracks().forEach((t) => (t.enabled = !cameraOff.value));
    if (cameraTrack) cameraTrack.enabled = !cameraOff.value || Boolean(effectTrack);
  }

  /** Switches between the front and back camera (phones), without dropping the call. */
  async function flipCamera() {
    if (mode.value !== 'video' || !localStream.value) return;
    const next = facing.value === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: next } } });
      const track = fresh.getVideoTracks()[0];
      const old = cameraTrack;
      cameraTrack = track;
      if (effectSource) effectSource.srcObject = new MediaStream([track]);
      else await useVideoTrack(track);
      old?.stop();
      facing.value = next;
    } catch {
      useToastStore().show('This device has only one camera.');
    }
  }

  function stopMedia() {
    stopEffect();
    cameraTrack?.stop();
    cameraTrack = null;
    localStream.value?.getTracks().forEach((t) => t.stop());
    pc?.close();
    pc = null;
    pendingIce = [];
  }

  /** Ends the call locally; `reason` is shown on the call screen, and `toast` also announces it elsewhere. */
  function finish(reason: string, toast: boolean) {
    generation++;
    clearTimeout(connectTimer);
    clearTimeout(ringTimer);
    stopMedia();
    localStream.value = null;
    remoteStream.value = null;
    endReason.value = reason;
    status.value = reason ? 'ended' : 'idle';
    if (toast && reason) useToastStore().error(reason);
  }

  function reset() {
    generation++;
    clearTimeout(connectTimer);
    stopMedia();
    clearTimeout(ringTimer);
    status.value = 'idle';
    endReason.value = '';
    localStream.value = null;
    remoteStream.value = null;
    startedAt.value = null;
    muted.value = false;
    cameraOff.value = false;
    facing.value = 'user';
    incomingReaction.value = null;
    effect.value = 'none';
  }

  function handleSignal(signal: Signal) {
    const attempt = generation;
    void onSignal(signal).catch(() => {
      if (attempt !== generation || !inCall.value) return;
      send('end');
      finish('The call connection failed. Please try again.', true);
    });
  }

  function handleDisconnect() {
    if (inCall.value) finish('Connection lost. Please reconnect and call again.', true);
  }

  /** Listens for calls on the current socket; safe to call again after a reconnect or new sign-in. */
  function bindSocket() {
    const socket = getSocket();
    if (!socket || socket === boundSocket) return;
    boundSocket?.off('call:signal', handleSignal);
    boundSocket?.off('disconnect', handleDisconnect);
    socket.on('call:signal', handleSignal);
    socket.on('disconnect', handleDisconnect);
    boundSocket = socket;
  }

  return {
    status,
    mode,
    conversationId,
    endReason,
    localStream,
    remoteStream,
    startedAt,
    muted,
    cameraOff,
    incomingReaction,
    effect,
    inCall,
    start,
    accept,
    decline,
    hangUp,
    reset,
    sendReaction,
    toggleMute,
    toggleCamera,
    flipCamera,
    setEffect,
    bindSocket,
  };
});
