import React, { useState } from 'react';
import { i18n, type Locale } from '../i18n';

export const LanguageSwitcher: React.FC = () => {
  const [locale, setLocale] = useState<Locale>(i18n.getLocale());

  const handleChange = (newLocale: Locale) => {
    i18n.setLocale(newLocale);
    setLocale(newLocale);
    // 刷新页面以应用新语言
    window.location.reload();
  };

  return (
    <div className="relative inline-block">
      <select
        value={locale}
        onChange={(e) => handleChange(e.target.value as Locale)}
        className="appearance-none bg-white border border-gray-300 rounded px-3 py-1.5 pr-8 text-sm cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="zh-CN">🇨🇳 中文</option>
        <option value="en-US">🇺🇸 English</option>
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
};
