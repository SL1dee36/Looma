// Author: Nazaryan Artem (@sl1dee36)
import { useMemo, useState } from 'react';
import { Delete, CornerDownLeft, Globe, Smile, ArrowBigUp } from 'lucide-react';

export const CHAT_EMOJIS = [
  '😀', '😂', '🤣', '😍', '🥰', '😎',
  '🤩', '🥳', '😭', '😱', '🤯', '🤔',
  '😴', '🤢', '😡', '🥺', '🤫', '🤡',
  '👍', '👎', '👏', '🙌', '🔥', '❤️',
  '💔', '💯', '✨', '🎉', '🍿', '🎬',
  '🍕', '🍺', '☕', '👀', '💀', '🚀',
] as const;

type LayoutId = 'ru' | 'en' | 'uk' | 'num';

const LAYOUTS: Record<LayoutId, { label: string; rows: string[][] }> = {
  ru: {
    label: 'RU',
    rows: [
      ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
      ['ф', 'ы', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
      ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ё'],
    ],
  },
  uk: {
    label: 'UK',
    rows: [
      ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'щ', 'з', 'х'],
      ['ф', 'і', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'є'],
      ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ї'],
    ],
  },
  en: {
    label: 'EN',
    rows: [
      ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
      ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
      ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    ],
  },
  num: {
    label: '123',
    rows: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['-', '/', ':', ';', '(', ')', '₽', '&', '@', '"'],
      ['.', ',', '?', '!', "'", '+', '=', '*'],
    ],
  },
};

function getDeviceLayouts(): Array<'ru' | 'en' | 'uk'> {
  const raw =
    typeof navigator !== 'undefined'
      ? navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
      : ['ru', 'en'];

  const detected: Array<'ru' | 'en' | 'uk'> = [];
  for (const locale of raw) {
    const code = locale.toLowerCase().split('-')[0];
    if ((code === 'ru' || code === 'en' || code === 'uk') && !detected.includes(code)) {
      detected.push(code);
    }
  }
  if (detected.length === 0) detected.push('ru');
  if (!detected.includes('en')) detected.push('en');
  return detected;
}

interface ChatKeyboardProps {
  onChar: (char: string) => void;
  onBackspace: () => void;
  onSubmit: () => void;
}

export function ChatKeyboard({ onChar, onBackspace, onSubmit }: ChatKeyboardProps) {
  const deviceLayouts = useMemo(() => getDeviceLayouts(), []);
  const [langIndex, setLangIndex] = useState(0);
  const [mode, setMode] = useState<'alpha' | 'num' | 'emoji'>('alpha');
  const [shift, setShift] = useState(false);

  const activeAlpha = deviceLayouts[langIndex % deviceLayouts.length];
  const currentLayoutId: LayoutId = mode === 'num' ? 'num' : activeAlpha;
  const rows = LAYOUTS[currentLayoutId].rows;

  const handleKeyPress = (char: string) => {
    const out = mode === 'alpha' && shift ? char.toUpperCase() : char;
    onChar(out);
    if (shift) setShift(false);
  };

  const cycleLanguage = () => {
    setMode('alpha');
    setLangIndex((i) => (i + 1) % deviceLayouts.length);
  };

  return (
    <div className="border-t border-white/8 bg-[#0E1015] p-2 select-none">
      {mode === 'emoji' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {CHAT_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onChar(emoji)}
                className="flex h-9 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 active:scale-95 text-lg transition cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMode('alpha')}
              className="flex-1 rounded-lg bg-[#181B22] hover:bg-white/10 py-2 text-xs font-medium text-zinc-200 transition cursor-pointer"
            >
              ABC ({LAYOUTS[activeAlpha].label})
            </button>
            <button
              type="button"
              onClick={onBackspace}
              className="flex h-9 w-12 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 text-zinc-300 transition cursor-pointer"
            >
              <Delete className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="flex h-9 w-12 items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition cursor-pointer"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-center gap-1">
              {rowIdx === 2 && mode === 'alpha' && (
                <button
                  type="button"
                  onClick={() => setShift((s) => !s)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs transition cursor-pointer ${shift
                      ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-400/40'
                      : 'bg-[#181B22] text-zinc-300 hover:bg-white/10'
                    }`}
                >
                  <ArrowBigUp className="h-4 w-4" />
                </button>
              )}

              {row.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeyPress(key)}
                  className="flex h-9 flex-1 min-w-0 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/12 active:bg-indigo-500/30 text-xs font-medium text-zinc-100 transition cursor-pointer"
                >
                  {mode === 'alpha' && shift ? key.toUpperCase() : key}
                </button>
              ))}

              {rowIdx === 2 && (
                <button
                  type="button"
                  onClick={onBackspace}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 text-zinc-300 transition cursor-pointer"
                >
                  <Delete className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {/* Bottom Control Row */}
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'num' ? 'alpha' : 'num'))}
              className="flex h-9 px-2.5 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 text-[11px] font-medium text-zinc-300 transition cursor-pointer"
            >
              {mode === 'num' ? LAYOUTS[activeAlpha].label : '123'}
            </button>

            <button
              type="button"
              onClick={cycleLanguage}
              title="Переключить язык"
              className="flex h-9 px-2.5 items-center gap-1 rounded-lg bg-[#181B22] hover:bg-white/10 text-[11px] font-medium text-zinc-300 transition cursor-pointer"
            >
              <Globe className="h-3.5 w-3.5" />
              {LAYOUTS[activeAlpha].label}
            </button>

            <button
              type="button"
              onClick={() => setMode('emoji')}
              title="Эмодзи"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 text-zinc-300 transition cursor-pointer"
            >
              <Smile className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => onChar(' ')}
              className="flex h-9 flex-1 items-center justify-center rounded-lg bg-[#181B22] hover:bg-white/10 text-[11px] text-zinc-400 transition cursor-pointer"
            >
              Space
            </button>

            <button
              type="button"
              onClick={onSubmit}
              className="flex h-9 px-3 items-center justify-center rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white transition cursor-pointer"
            >
              <CornerDownLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

