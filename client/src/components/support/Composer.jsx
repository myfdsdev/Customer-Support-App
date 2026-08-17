import React, { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Loader2, Mic, MicOff, ArrowUp } from 'lucide-react';
import cn from '../../utils/cn';

/** Dictation is an input convenience, not a transport — absent browsers just don't show the button. */
const SpeechRecognitionAPI =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

/** Auto-growing message box with attachment support. */
export default function Composer({
  onSend,
  onUpload,
  onTyping,
  disabled,
  placeholder = 'Type your message…',
  busy,
  variant = 'default',
  hint,
}) {
  const [value, setValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [listening, setListening] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);
  const recognitionRef = useRef(null);

  const immersive = variant === 'immersive';

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, immersive ? 120 : 160)}px`;
  }, [value, immersive]);

  // Stop the typing indicator if the customer walks away mid-sentence.
  useEffect(() => () => clearTimeout(typingTimer.current), []);

  // Never leave the microphone open behind a closed screen.
  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  const handleChange = (e) => {
    setValue(e.target.value);
    onTyping?.(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => onTyping?.(false), 1500);
  };

  const submit = async (e) => {
    e?.preventDefault();
    const text = value.trim();
    if (!text || disabled) return;
    // Clear immediately and do not restore on failure: the message is already
    // on screen as an optimistic bubble that owns its own error + Retry, so
    // putting the text back would leave the customer with two copies.
    setValue('');
    onTyping?.(false);
    onSend(text);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(file, value.trim());
      setValue('');
    } finally {
      setUploading(false);
    }
  };

  /**
   * Dictation only fills the box — the transcript lands in the same state a
   * keystroke would, and sending still goes through `submit`.
   */
  const toggleDictation = () => {
    if (!SpeechRecognitionAPI || disabled) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = document.documentElement.lang || 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((r) => r[0]?.transcript || '')
        .join(' ')
        .trim();
      if (text) setValue((v) => (v.trim() ? `${v.trim()} ${text}` : text));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const canSend = Boolean(value.trim()) && !disabled;

  if (immersive) {
    return (
      <form onSubmit={submit} className="shrink-0 px-4 pb-5 pt-2 sm:pb-7">
        {/* Colours come from the stage's custom properties, so a product can
            restyle the bar without this component knowing about it. */}
        <div
          className="support-input-glow mx-auto flex w-full max-w-3xl items-end gap-1 rounded-[28px]
                     border px-2.5 py-2 backdrop-blur-xl"
        >
          {onUpload && (
            <>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={pickFile}
                accept="image/*,.pdf,.txt,.zip,.csv,.json"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={disabled || uploading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/50
                           transition-colors hover:bg-white/10 hover:text-white/90 disabled:opacity-40"
                aria-label="Attach a file"
              >
                {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Paperclip className="h-[18px] w-[18px]" />}
              </button>
            </>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            aria-label="Message"
            className="support-input-text max-h-32 flex-1 resize-none self-center bg-transparent px-2.5 py-2
                       text-[15px] focus:outline-none disabled:opacity-50"
          />

          {SpeechRecognitionAPI && (
            <button
              type="button"
              onClick={toggleDictation}
              disabled={disabled}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40',
                listening ? 'bg-orange-400/20 text-orange-300' : 'text-white/50 hover:bg-white/10 hover:text-white/90'
              )}
              aria-label={listening ? 'Stop dictation' : 'Dictate a message'}
              aria-pressed={listening}
            >
              {listening ? <MicOff className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}
            </button>
          )}

          {/* Stays enabled while a previous message is in flight — consecutive
              sends must not be gated on the network. */}
          <button
            type="submit"
            disabled={!canSend}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
              canSend ? 'bg-white text-slate-900 hover:bg-white/90' : 'bg-white/10 text-white/35'
            )}
            aria-label="Send message"
          >
            {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" />}
          </button>
        </div>

        {hint && <p className="mt-2.5 text-center text-[11px] text-white/35">{hint}</p>}
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 border-t border-ink-200 bg-white p-3">
      {onUpload && (
        <>
          <input ref={fileRef} type="file" className="hidden" onChange={pickFile} accept="image/*,.pdf,.txt,.zip,.csv,.json" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            className="rounded-lg p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600 disabled:opacity-50"
            aria-label="Attach a file"
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </button>
        </>
      )}

      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Message"
        className="max-h-40 flex-1 resize-none rounded-xl border border-ink-300 px-3.5 py-2.5 text-sm
                   placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20
                   disabled:bg-ink-50"
      />

      {/* Stays enabled while a previous message is in flight — consecutive
          sends must not be gated on the network. */}
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
          value.trim() && !disabled ? 'bg-brand-600 text-ink-900 hover:bg-brand-500' : 'bg-ink-200 text-ink-400'
        )}
        aria-label="Send message"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </form>
  );
}
