import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEME_KEY = 'faultline_theme';

const ThemeContext = createContext(undefined);

export function ThemeProvider({ children }) {
    const [theme, setThemeState] = useState(() => {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === 'dark' || stored === 'light') {
            return stored;
        }
        return 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            root.classList.remove('light');
        } else {
            root.classList.remove('dark');
            root.classList.add('light');
        }
        localStorage.setItem(THEME_KEY, theme);
    }, [theme]);

    const setTheme = useCallback((newTheme) => {
        setThemeState(newTheme);
    }, []);

    const toggleTheme = useCallback(() => {
        setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
    }, []);

    const value = {
        theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
    };

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (ctx === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return ctx;
}
