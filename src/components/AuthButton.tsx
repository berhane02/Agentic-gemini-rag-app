'use client';

import { useUserContext } from '@/contexts/UserContext';
import { useClerk } from '@clerk/nextjs';
import { LogIn, LogOut, CircleUser } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { memo, useState, useRef, useEffect } from 'react';

function AuthButton() {
    const { user, isLoading } = useUserContext();
    const clerk = useClerk();
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    
    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        };
        
        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    if (isLoading) {
        return (
            <div className="auth-button-loading h-10 w-10 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-full" />
        );
    }

    if (user) {
        return (
            <div className="auth-button-container flex items-center gap-2 md:gap-3">
                {/* User Info - Hidden on small screens */}
                <div className="auth-button-user-info hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="auth-button-avatar-wrapper relative">
                        <img
                            src={user.picture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
                            alt={user.name || 'User'}
                            className="auth-button-avatar w-8 h-8 rounded-full border-2 border-blue-500 dark:border-blue-400 shadow-sm object-cover object-center ring-2 ring-blue-500/20 dark:ring-blue-400/20"
                            style={{ objectPosition: 'center center' }}
                        />
                        <div className="auth-button-online-indicator absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"></div>
                    </div>
                    <div className="auth-button-user-details flex flex-col min-w-0">
                        <span className="auth-button-user-name text-xs font-semibold text-gray-900 dark:text-white truncate max-w-[100px]">
                            {user.name || 'User'}
                        </span>
                        <span className="auth-button-user-email text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[100px]">
                            {user.email}
                        </span>
                    </div>
                </div>
                
                {/* User Avatar Icon Only - Visible on small screens with dropdown menu */}
                <div className="auth-button-mobile-menu md:hidden relative" ref={menuRef}>
                    <motion.button
                        onClick={() => setShowMenu(!showMenu)}
                        whileTap={{ scale: 0.95 }}
                        className="auth-button-mobile-trigger relative"
                    >
                        <img
                            src={user.picture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
                            alt={user.name || 'User'}
                            className="auth-button-mobile-avatar w-8 h-8 rounded-full border-2 border-blue-500 dark:border-blue-400 shadow-sm object-cover object-center ring-2 ring-blue-500/20 dark:ring-blue-400/20 cursor-pointer hover:ring-4 hover:ring-blue-500/30 dark:hover:ring-blue-400/30 transition-all"
                            style={{ objectPosition: 'center center' }}
                        />
                        <div className="auth-button-mobile-online-indicator absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white dark:border-gray-900 rounded-full"></div>
                    </motion.button>
                    
                    {/* Dropdown Menu */}
                    <AnimatePresence>
                        {showMenu && (
                            <motion.div
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="auth-button-dropdown-menu absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50"
                            >
                                {/* Logout Option - At Top */}
                                <div className="auth-button-dropdown-logout-section py-1">
                                    <motion.button
                                        onClick={() => {
                                            clerk.signOut({ redirectUrl: '/home' });
                                            setShowMenu(false);
                                        }}
                                        whileHover={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}
                                        whileTap={{ scale: 0.98 }}
                                        className="auth-button-dropdown-logout-button w-full px-4 py-2.5 flex items-center gap-3 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                                    >
                                        <LogOut size={16} strokeWidth={1.75} />
                                        <span>Logout</span>
                                    </motion.button>
                                </div>
                                
                                {/* Divider */}
                                <div className="auth-button-dropdown-divider border-t border-gray-200 dark:border-gray-700" />
                                
                                {/* User Info Section */}
                                <div className="auth-button-dropdown-user-section px-4 py-3">
                                    <div className="auth-button-dropdown-user-info flex items-center gap-3">
                                        <img
                                            src={user.picture || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
                                            alt={user.name || 'User'}
                                            className="auth-button-dropdown-avatar w-10 h-10 rounded-full border-2 border-blue-500 dark:border-blue-400 object-cover"
                                        />
                                        <div className="auth-button-dropdown-user-details flex flex-col min-w-0 flex-1">
                                            <span className="auth-button-dropdown-user-name text-sm font-semibold text-gray-900 dark:text-white truncate">
                                                {user.name || 'User'}
                                            </span>
                                            <span className="auth-button-dropdown-user-email text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {user.email}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                
                {/* Logout Button - Hidden on small screens */}
                <motion.button
                    onClick={() => {
                        clerk.signOut({ redirectUrl: '/home' });
                    }}
                    whileHover={{ scale: 1.05, x: 2 }}
                    whileTap={{ scale: 0.95 }}
                    className="auth-button-logout-button hidden md:flex group relative items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-red-500 via-red-600 to-red-500 hover:from-red-600 hover:via-red-700 hover:to-red-600 rounded-lg transition-all duration-200 shadow-lg shadow-red-500/30 hover:shadow-red-500/50 overflow-hidden"
                    title="Logout"
                >
                    <div className="auth-button-logout-button-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                    <LogOut size={16} className="relative z-10" strokeWidth={1.75} />
                    <span className="relative z-10">Logout</span>
                </motion.button>
            </div>
        );
    }

    return (
        <motion.button
            onClick={() => {
                // Only open sign-in if user is not already signed in
                if (!user) {
                    clerk.openSignIn({ redirectUrl: '/chat' });
                }
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="auth-button-login-button flex items-center justify-center gap-2 px-2 md:px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 rounded-lg transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
            title="Login"
        >
            <LogIn size={18} className="md:w-[18px] md:h-[18px]" strokeWidth={1.75} />
            <span className="hidden md:inline">Login</span>
        </motion.button>
    );
}

export default memo(AuthButton);
