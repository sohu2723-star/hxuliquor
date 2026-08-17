import type { ToastMessage } from '../components/AppToast'

let audioContext: AudioContext | null = null

function playTone(type: ToastMessage['type']) {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    audioContext ||= new AudioContextClass()
    const context = audioContext
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = type === 'success' ? 880 : type === 'error' ? 220 : 520
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.2)
  } catch { /* browser may block audio before user gesture */ }
}

export function notify(setToast: (toast: ToastMessage | null) => void, message: string, type: ToastMessage['type']) {
  setToast({ message, type })
  playTone(type)
  window.setTimeout(() => setToast(null), 4000)
}
