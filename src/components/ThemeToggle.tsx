'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ThemeToggle() {
    const { theme, setTheme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Avoid hydration mismatch
    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return (
            <div className="theme-toggle-loading w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        );
    }

    // Determine if dark mode is active
    const isDark = resolvedTheme === 'dark';

    const toggleTheme = () => {
        const newTheme = isDark ? 'light' : 'dark';
        setTheme(newTheme);
    };

    return (
        <motion.button
            onClick={toggleTheme}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className="theme-toggle-button relative overflow-hidden p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200 w-9 h-9 flex items-center justify-center"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
            title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        >
            {/* Subtle glow behind the icon */}
            <motion.div
                className="absolute inset-0 rounded-lg"
                animate={{
                    background: isDark
                        ? 'radial-gradient(circle at center, rgba(250,204,21,0.15) 0%, transparent 70%)'
                        : 'radial-gradient(circle at center, rgba(99,102,241,0.12) 0%, transparent 70%)',
                }}
                transition={{ duration: 0.4 }}
            />

            <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                    <motion.div
                        key="sun"
                        initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="relative z-10"
                    >
                        <Sun
                            size={18}
                            className="theme-toggle-icon theme-toggle-icon-sun text-amber-400"
                            strokeWidth={1.5}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="moon"
                        initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="relative z-10"
                    >
                        <Moon
                            size={18}
                            className="theme-toggle-icon theme-toggle-icon-moon text-slate-600 dark:text-slate-300"
                            strokeWidth={1.5}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );
}
