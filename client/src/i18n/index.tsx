import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en.json';
import ru from './ru.json';
import he from './he.json';

type Lang = 'en' | 'ru' | 'he';
const DICTS: Record<Lang, Record<string, string>> = { en, ru, he };
const RTL_LANGS: Lang[] = ['he'];

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem('lang') as Lang) || 'en');
  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('lang', l);
    setLangState(l);
  }, []);
  // Apply document language + direction (RTL for Hebrew).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = RTL_LANGS.includes(lang) ? 'rtl' : 'ltr';
  }, [lang]);
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let str = DICTS[lang][key] ?? DICTS.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
      return str;
    },
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside provider');
  return ctx;
}

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex gap-1 text-xs">
      {(['en', 'ru', 'he'] as Lang[]).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={`rounded px-2 py-1 font-semibold uppercase ${lang === l ? 'bg-white text-slate-900' : 'text-white/80 hover:text-white'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
