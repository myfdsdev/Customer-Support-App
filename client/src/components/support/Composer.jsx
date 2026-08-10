import React, { useEffect, useRef, useState } from 'react';
import { Send, Paperclip, Loader2 } from 'lucide-react';
import cn from '../../utils/cn';

/** Auto-growing message box with attachment support. */
export default function Composer({ onSend, onUpload, onTyping, disabled, placeholder = 'Type your message…', busy }) {
  const [value, setValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  // Stop the typing indicator if the customer walks away mid-sentence.
  useEffect(() => () => clearTimeout(typingTimer.current), []);

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
                   placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20
                   disabled:bg-ink-50"
      />

      {/* Stays enabled while a previous message is in flight — consecutive
          sends must not be gated on the network. */}
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
          value.trim() && !disabled ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-ink-200 text-ink-400'
        )}
        aria-label="Send message"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </form>
  );
}
