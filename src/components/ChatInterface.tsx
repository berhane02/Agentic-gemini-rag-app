'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { useRouter } from 'next/navigation';
import FileUpload from './FileUpload';
import UrlUpload from './UrlUpload';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import AuthButton from './AuthButton';
import ConfirmDialog from './ConfirmDialog';
import CondenseModal from './CondenseModal';
import ConversationHistory from './ConversationHistory';
import { CircleUser, Trash2, House, Clock, MessageCircle, Lightbulb, ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { logger } from '@/lib/logger';

interface Message {
    role: 'user' | 'model';
    content: string;
}

interface ChatInterfaceProps {
    user: {
        sub?: string;
        name?: string;
        email?: string;
        picture?: string;
        [key: string]: any;
    };
}

const STORAGE_KEY_PREFIX = 'chat-messages_';
const SUMMARY_STORAGE_KEY_PREFIX = 'chat-summary_';

// Get user-specific storage key
function getStorageKey(userId: string) {
    return `${STORAGE_KEY_PREFIX}${userId}`;
}

// Get user-specific storage key for the condensed conversation summary
function getSummaryStorageKey(userId: string) {
    return `${SUMMARY_STORAGE_KEY_PREFIX}${userId}`;
}

type TabType = 'home' | 'previous';

function ChatInterfaceComponent({ user }: ChatInterfaceProps) {
    const router = useRouter();
    const userId = user?.sub || 'anonymous';
    const storageKey = getStorageKey(userId);
    const summaryStorageKey = getSummaryStorageKey(userId);
    const previousUserIdRef = useRef<string | null>(null);
    
    // Tab state - default to 'home' when user logs in
    const [activeTab, setActiveTab] = useState<TabType>('home');
    
    // Separate message states for home and previous chats
    const [homeMessages, setHomeMessages] = useState<Message[]>([]);
    
    // Load previous messages from localStorage on mount - user-specific
    const [previousMessages, setPreviousMessages] = useState<Message[]>(() => {
        if (typeof window !== 'undefined' && userId !== 'anonymous') {
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    return JSON.parse(saved);
                }
            } catch (error) {
                logger.error('Error loading messages from localStorage', error);
            }
        }
        return [];
    });
    
    // Current messages based on active tab
    const messages = activeTab === 'home' ? homeMessages : previousMessages;
    const setMessages = activeTab === 'home' ? setHomeMessages : setPreviousMessages;
    
    // Clear previous user's messages when user changes
    useEffect(() => {
        if (previousUserIdRef.current && previousUserIdRef.current !== userId && previousUserIdRef.current !== 'anonymous') {
            // Clear previous user's messages and summary
            const previousStorageKey = getStorageKey(previousUserIdRef.current);
            const previousSummaryKey = getSummaryStorageKey(previousUserIdRef.current);
            try {
                localStorage.removeItem(previousStorageKey);
                localStorage.removeItem(previousSummaryKey);
            } catch (error) {
                logger.error('Error clearing previous user messages', error);
            }
        }
        previousUserIdRef.current = userId;
        
        // Reset to home tab when user changes
        setActiveTab('home');
        setHomeMessages([]);
        setHomeSummary(null);

        // Load previous messages and summary for new user
        if (userId !== 'anonymous') {
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    setPreviousMessages(JSON.parse(saved));
                } else {
                    setPreviousMessages([]);
                }
            } catch (error) {
                logger.error('Error loading messages from localStorage', error);
                setPreviousMessages([]);
            }
            try {
                setPreviousSummary(localStorage.getItem(summaryStorageKey) || null);
            } catch (error) {
                logger.error('Error loading summary from localStorage', error);
                setPreviousSummary(null);
            }
        } else {
            setPreviousSummary(null);
        }
    }, [userId, storageKey, summaryStorageKey]);
    
    // Handle tab switching
    const handleTabSwitch = (tab: TabType) => {
        if (tab === activeTab) return;
        
        // When switching from home to previous, merge home messages into previous if they exist
        if (activeTab === 'home' && homeMessages.length > 0 && userId !== 'anonymous') {
            try {
                // Merge home messages with previous messages (append home to previous)
                const merged = [...previousMessages, ...homeMessages];
                localStorage.setItem(storageKey, JSON.stringify(merged));
                setPreviousMessages(merged);
                // Clear home messages after merging
                setHomeMessages([]);
                // The home summary described the now-merged messages; drop it so it
                // isn't sent as stale context for a fresh home chat.
                setHomeSummary(null);
            } catch (error) {
                logger.error('Error saving messages to localStorage', error);
            }
        }
        
        setActiveTab(tab);
        setEditingIndex(null);
        setEditContent('');
        setSelectedHistoryIndex(null);
    };
    
    // Additional safeguard: prevent navigation away from chat
    useEffect(() => {
        if (typeof window !== 'undefined') {
            // Function to check if URL is OAuth-related
            const isOAuthUrl = (url: string) => {
                return url.includes('accounts.google.com') || 
                       url.includes('oauth') || 
                       url.includes('signin') ||
                       url.includes('clerk.shared.lcl.dev/v1/oauth_callback');
            };

            // Function to ensure we're on chat page
            const ensureOnChat = () => {
                const currentUrl = window.location.href;
                const currentPath = window.location.pathname;
                
                // If we're on OAuth URL or not on chat, immediately redirect
                if (isOAuthUrl(currentUrl) || currentPath !== '/chat') {
                    window.history.replaceState({ page: 'chat' }, '', '/chat');
                    router.replace('/chat');
                    return true;
                }
                return false;
            };

            // Check immediately
            ensureOnChat();
            
            // Monitor location changes aggressively
            const checkLocation = () => {
                const currentUrl = window.location.href;
                const currentPath = window.location.pathname;
                
                if (isOAuthUrl(currentUrl) || (currentPath !== '/chat' && !currentPath.includes('/chat'))) {
                    ensureOnChat();
                }
            };
            
            // Check frequently
            const locationCheckInterval = setInterval(checkLocation, 100);
            
            // Monitor popstate events
            const handlePopState = () => {
                checkLocation();
            };
            
            window.addEventListener('popstate', handlePopState);
            
            return () => {
                clearInterval(locationCheckInterval);
                window.removeEventListener('popstate', handlePopState);
            };
        }
    }, []);
    const [isLoading, setIsLoading] = useState(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editContent, setEditContent] = useState<string>('');
    const [showClearDialog, setShowClearDialog] = useState(false);
    const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<number | null>(null);

    // Condensed conversation summary, kept per-tab (mirrors home/previous messages).
    // Used both for display and as context for follow-up questions.
    const [homeSummary, setHomeSummary] = useState<string | null>(null);
    const [previousSummary, setPreviousSummary] = useState<string | null>(() => {
        if (typeof window !== 'undefined' && userId !== 'anonymous') {
            try {
                return localStorage.getItem(getSummaryStorageKey(userId)) || null;
            } catch (error) {
                logger.error('Error loading summary from localStorage', error);
            }
        }
        return null;
    });
    const conversationSummary = activeTab === 'home' ? homeSummary : previousSummary;
    const setConversationSummary = activeTab === 'home' ? setHomeSummary : setPreviousSummary;
    const [showCondenseModal, setShowCondenseModal] = useState(false);
    const [isCondensing, setIsCondensing] = useState(false);
    const [condenseError, setCondenseError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastMessageLengthRef = useRef<number>(0);
    const isInitialMount = useRef(true);

    // Save previous messages to localStorage whenever they change - user-specific
    useEffect(() => {
        // Skip saving on initial mount to avoid overwriting with empty array
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        // Save previous messages when they change and we're in previous tab
        if (activeTab === 'previous' && userId !== 'anonymous' && previousMessages.length > 0) {
        try {
                localStorage.setItem(storageKey, JSON.stringify(previousMessages));
        } catch (error) {
            logger.error('Error saving messages to localStorage', error);
            }
        }
    }, [previousMessages, storageKey, userId, activeTab]);

    // Persist the previous-chat summary to localStorage whenever it changes - user-specific
    useEffect(() => {
        if (userId === 'anonymous') return;
        try {
            if (previousSummary) {
                localStorage.setItem(summaryStorageKey, previousSummary);
            } else {
                localStorage.removeItem(summaryStorageKey);
            }
        } catch (error) {
            logger.error('Error saving summary to localStorage', error);
        }
    }, [previousSummary, summaryStorageKey, userId]);

    // When switching to previous tab, ensure we have the latest from localStorage
    useEffect(() => {
        if (activeTab === 'previous' && userId !== 'anonymous') {
            try {
                const saved = localStorage.getItem(storageKey);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (JSON.stringify(parsed) !== JSON.stringify(previousMessages)) {
                        setPreviousMessages(parsed);
                    }
                }
            } catch (error) {
                logger.error('Error loading messages from localStorage', error);
            }
        }
    }, [activeTab, userId, storageKey]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        // Only scroll if messages length actually changed
        if (messages.length !== lastMessageLengthRef.current && messages.length > 0) {
            lastMessageLengthRef.current = messages.length;
            scrollToBottom();
        }
    }, [messages.length]); // Only depend on length to prevent excessive scrolling

    const handleClearChat = () => {
        setShowClearDialog(true);
    };

    const confirmClearChat = () => {
        if (activeTab === 'home') {
            setHomeMessages([]);
        } else {
            setPreviousMessages([]);
            // Clear from localStorage - user-specific
            if (userId !== 'anonymous') {
                try {
                    localStorage.removeItem(storageKey);
                } catch (error) {
                    logger.error('Error clearing messages from localStorage', error);
                }
            }
        }
        // Clearing the conversation invalidates its summary.
        setConversationSummary(null);
        setEditingIndex(null);
        setEditContent('');
        setSelectedHistoryIndex(null);
    };

    const handleCondense = async () => {
        const currentMessages = activeTab === 'home' ? homeMessages : previousMessages;
        if (currentMessages.length < 2 || isCondensing) return;

        setShowCondenseModal(true);
        setIsCondensing(true);
        setCondenseError(null);

        try {
            const response = await fetch('/api/condense', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: currentMessages }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            if (!data.summary) {
                throw new Error('No summary was returned. Please try again.');
            }
            setConversationSummary(data.summary);
        } catch (error) {
            logger.error('Error condensing conversation', error);
            setCondenseError(
                error instanceof Error
                    ? error.message
                    : 'Failed to condense conversation. Please try again.'
            );
        } finally {
            setIsCondensing(false);
        }
    };

    const handleEdit = (index: number, content: string) => {
        setEditingIndex(index);
        setEditContent(content);
        setSelectedHistoryIndex(index);
        // Scroll to input field when editing starts
        setTimeout(() => {
            const inputElement = document.querySelector('textarea');
            if (inputElement) {
                inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 200);
    };

    const handleHistoryClick = (index: number) => {
        setSelectedHistoryIndex(index);
        // Scroll to the selected message in the main chat area
        setTimeout(() => {
            const messageElement = document.querySelector(`[data-message-index="${index}"]`);
            if (messageElement) {
                messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    };

    const handleSend = async (content: string) => {
        // Determine which message state to use based on active tab
        const currentMessages = activeTab === 'home' ? homeMessages : previousMessages;
        const setCurrentMessages = activeTab === 'home' ? setHomeMessages : setPreviousMessages;
        
        // If editing, remove the old message and all subsequent messages (including AI response)
        if (editingIndex !== null) {
            setCurrentMessages((prev) => prev.slice(0, editingIndex));
            setEditingIndex(null);
            setEditContent('');
        }

        const userMessage: Message = { role: 'user', content };
        setCurrentMessages((prev) => [...prev, userMessage]);
        setIsLoading(true);

        try {
            const currentSummary = activeTab === 'home' ? homeSummary : previousSummary;
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    ...(currentSummary ? { context: currentSummary } : {}),
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || `Server error: ${response.status}`;
                throw new Error(errorMessage);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error('No reader available');

            let aiMessage: Message = { role: 'model', content: '' };
            setCurrentMessages((prev) => [...prev, aiMessage]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = new TextDecoder().decode(value);
                aiMessage = { ...aiMessage, content: aiMessage.content + text };

                setCurrentMessages((prev) => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = aiMessage;
                    return newMessages;
                });
            }
            
            // Auto-save previous messages to localStorage after sending
            if (activeTab === 'previous' && userId !== 'anonymous') {
                try {
                    // Get the latest messages after the update
                    setTimeout(() => {
                        if (previousMessages.length > 0) {
                            localStorage.setItem(storageKey, JSON.stringify(previousMessages));
                        }
                    }, 100);
                } catch (error) {
                    logger.error('Error auto-saving messages', error);
                }
            }
        } catch (error) {
            logger.error('Error sending message', error);
            let errorMessage = 'Sorry, I encountered an error. Please try again.';

            if (error instanceof Error) {
                if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                    errorMessage = 'Network error: Unable to connect to the server. Please check your connection and try again.';
                } else if (error.message.includes('Unauthorized')) {
                    errorMessage = 'Authentication error: Please log in again.';
                } else if (error.message) {
                    errorMessage = `Error: ${error.message}`;
                }
            }

            setCurrentMessages((prev) => [
                ...prev,
                { role: 'model', content: errorMessage },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="chat-interface-container flex h-screen flex-col bg-white dark:bg-gray-950">
            {/* Navbar - Responsive */}
            <header className="chat-header border-b border-gray-200/70 dark:border-gray-800/70 bg-white/70 dark:bg-gray-900/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-gray-900/60 shadow-sm sticky top-0 z-20">
                {/* Mobile Layout */}
                <div className="px-2 py-1 sm:hidden flex items-center gap-1.5 relative min-w-0">
                    {/* Left section - Brand and Tabs */}
                    <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                        {/* Brand badge + wordmark */}
                        <div className="flex items-center gap-1.5 shrink-0">
                            <motion.div
                                whileTap={{ scale: 0.9, rotate: -8 }}
                                className="relative flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-md shadow-indigo-500/30"
                            >
                                <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/30 to-transparent" />
                                <Sparkles size={12} className="relative text-white" strokeWidth={2} />
                            </motion.div>
                        </div>

                        {/* Segmented tab control with animated sliding pill - Icons only on mobile */}
                        <div className="flex items-center gap-1 shrink-0">
                            <div className="relative flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100/80 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 shrink-0">
                            <button
                                onClick={() => handleTabSwitch('home')}
                                className={`relative p-1 rounded-md transition-colors duration-200 shrink-0 ${
                                    activeTab === 'home'
                                        ? 'text-blue-700 dark:text-blue-300'
                                        : 'text-gray-500 dark:text-gray-400'
                                }`}
                                title="Home Chat"
                            >
                                {activeTab === 'home' && (
                                    <motion.div
                                        layoutId="activeTabPillMobile"
                                        className="absolute inset-0 rounded-md bg-white dark:bg-gray-900 shadow-sm ring-1 ring-blue-500/10 dark:ring-blue-400/20"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <House
                                    size={14}
                                    className="relative z-10"
                                    strokeWidth={activeTab === 'home' ? 2.25 : 1.75}
                                />
                            </button>
                            <button
                                onClick={() => handleTabSwitch('previous')}
                                className={`relative p-1 rounded-md transition-colors duration-200 shrink-0 ${
                                    activeTab === 'previous'
                                        ? 'text-purple-700 dark:text-purple-300'
                                        : 'text-gray-500 dark:text-gray-400'
                                }`}
                                title="Previous Chat"
                            >
                                {activeTab === 'previous' && (
                                    <motion.div
                                        layoutId="activeTabPillMobile"
                                        className="absolute inset-0 rounded-md bg-white dark:bg-gray-900 shadow-sm ring-1 ring-purple-500/10 dark:ring-purple-400/20"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <Clock
                                    size={14}
                                    className="relative z-10"
                                    strokeWidth={activeTab === 'previous' ? 2.25 : 1.75}
                                />
                                {previousMessages.length > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                        className="absolute -top-1 -right-1 z-20 h-3 w-3 rounded-full bg-gradient-to-br from-purple-500 to-pink-600 text-white text-[7px] flex items-center justify-center font-bold shadow-sm"
                                    >
                                        {previousMessages.length > 9 ? '9+' : previousMessages.length}
                                    </motion.span>
                                )}
                            </button>
                            </div>
                            {messages.length >= 2 && (
                                <motion.button
                                    onClick={handleCondense}
                                    disabled={isCondensing}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-1 rounded-md bg-gradient-to-br from-purple-500 to-indigo-600 shadow-md shrink-0 disabled:opacity-60"
                                    title="Condense chat"
                                >
                                    <Sparkles size={14} className="text-white" strokeWidth={1.75} />
                                </motion.button>
                            )}
                            {messages.length > 0 && (
                                <motion.button
                                    onClick={handleClearChat}
                                    whileTap={{ scale: 0.95 }}
                                    className="p-1 rounded-md bg-gradient-to-br from-red-500 to-rose-600 shadow-md shrink-0"
                                    title="Clear chat"
                                >
                                    <Trash2 size={14} className="text-white" strokeWidth={1.75} />
                                </motion.button>
                            )}
                        </div>
                    </div>
                    
                    {/* File Upload / Website Upload - Centered on mobile with proper spacing */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-1.5 z-10 pointer-events-none">
                        <div className="pointer-events-auto">
                            <FileUpload compact={true} showText={false} />
                        </div>
                        <div className="pointer-events-auto">
                            <UrlUpload showText={false} />
                        </div>
                    </div>
                    
                    {/* Auth Button - Right end with proper spacing */}
                    <div className="flex items-center ml-auto shrink-0 z-20 relative">
                        <AuthButton />
                    </div>
                </div>

                {/* Tablet/Desktop Layout */}
                <div className="hidden sm:flex px-2 md:px-3 lg:px-4 py-1 md:py-1.5 items-center gap-1 md:gap-2 lg:gap-3 xl:gap-4 relative min-w-0">
                    {/* Left section - Brand and Tabs */}
                    <div className="flex items-center gap-2 md:gap-3 lg:gap-4 shrink-0 min-w-0">
                        {/* Brand */}
                        <div className="flex items-center gap-2 shrink-0">
                            <motion.div
                                whileHover={{ rotate: -8, scale: 1.08 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                                className="relative flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30"
                            >
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent" />
                                <Sparkles size={14} className="relative text-white md:w-4 md:h-4" strokeWidth={2} />
                            </motion.div>
                            <h1 className="chat-header-title text-sm md:text-base font-bold tracking-tight whitespace-nowrap shrink-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
                                Agentic RAG
                            </h1>
                        </div>

                        {/* Divider */}
                        <div className="h-5 w-px bg-gradient-to-b from-transparent via-gray-300 dark:via-gray-700 to-transparent shrink-0" />

                        {/* Segmented tab control with animated sliding pill */}
                        <div className="flex items-center gap-1 md:gap-1.5 lg:gap-2 shrink-0 min-w-0">
                            <div className="relative flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100/80 dark:bg-gray-800/60 border border-gray-200/60 dark:border-gray-700/60 shrink-0">
                            <button
                                onClick={() => handleTabSwitch('home')}
                                className={`relative px-2 md:px-2.5 lg:px-3 py-1 md:py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 shrink-0 ${
                                    activeTab === 'home'
                                        ? 'text-blue-700 dark:text-blue-300'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                {activeTab === 'home' && (
                                    <motion.div
                                        layoutId="activeTabPill"
                                        className="absolute inset-0 rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-blue-500/10 dark:ring-blue-400/20"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <House
                                    size={14}
                                    className="relative z-10 transition-transform duration-200"
                                    strokeWidth={activeTab === 'home' ? 2.25 : 1.75}
                                />
                                <span className="relative z-10 hidden md:inline whitespace-nowrap">Home Chat</span>
                                <span className="relative z-10 md:hidden whitespace-nowrap">Home</span>
                            </button>
                            <button
                                onClick={() => handleTabSwitch('previous')}
                                className={`relative px-2 md:px-2.5 lg:px-3 py-1 md:py-1.5 flex items-center justify-center gap-1.5 text-xs font-semibold rounded-lg transition-colors duration-200 shrink-0 ${
                                    activeTab === 'previous'
                                        ? 'text-purple-700 dark:text-purple-300'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                                }`}
                            >
                                {activeTab === 'previous' && (
                                    <motion.div
                                        layoutId="activeTabPill"
                                        className="absolute inset-0 rounded-lg bg-white dark:bg-gray-900 shadow-sm ring-1 ring-purple-500/10 dark:ring-purple-400/20"
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                                <Clock
                                    size={14}
                                    className="relative z-10 transition-transform duration-200"
                                    strokeWidth={activeTab === 'previous' ? 2.25 : 1.75}
                                />
                                <span className="relative z-10 hidden md:inline whitespace-nowrap">Previous Chat</span>
                                <span className="relative z-10 md:hidden whitespace-nowrap">Previous</span>
                                {previousMessages.length > 0 && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                                        className="relative z-10 ml-0.5 min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center text-[8px] font-bold bg-gradient-to-br from-purple-500 to-pink-600 text-white shadow-sm shadow-purple-500/40"
                                    >
                                        {previousMessages.length > 99 ? '99+' : previousMessages.length}
                                    </motion.span>
                                )}
                            </button>
                            </div>

                            {/* Condense Chat Button - Summarizes the conversation */}
                            {messages.length >= 2 && (
                                <motion.button
                                    onClick={handleCondense}
                                    disabled={isCondensing}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="condense-chat-button group relative px-1.5 md:px-2 lg:px-2.5 xl:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 ml-0.5 md:ml-1 lg:ml-1.5 overflow-hidden shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                                    title="Condense chat"
                                    aria-label="Condense chat"
                                >
                                    {/* Animated gradient background */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                    {/* Content */}
                                    <div className="relative flex items-center justify-center gap-0.5 md:gap-1 lg:gap-1.5">
                                        <div className="flex items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-md bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30 group-hover:shadow-xl group-hover:shadow-purple-500/50 transition-all duration-200 shrink-0">
                                            <Sparkles
                                                size={9}
                                                className="md:w-[11px] md:h-[11px] text-white transition-all duration-200 group-hover:scale-110"
                                                strokeWidth={1.75}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 group-hover:text-white transition-colors duration-200 hidden xl:inline whitespace-nowrap">
                                            Condense
                                        </span>
                                    </div>

                                    {/* Shine effect on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                                </motion.button>
                            )}

                            {/* Clear Chat Button - Next to Previous Chat */}
                            {messages.length > 0 && (
                                <motion.button
                                    onClick={handleClearChat}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="clear-chat-button group relative px-1.5 md:px-2 lg:px-2.5 xl:px-3 py-1 md:py-1.5 rounded-md transition-all duration-200 ml-0.5 md:ml-1 lg:ml-1.5 overflow-hidden shrink-0"
                                    title="Clear chat"
                                    aria-label="Clear chat"
                                >
                                    {/* Animated gradient background */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-red-500 via-rose-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 via-rose-600/20 to-pink-600/20 group-hover:from-red-600/30 group-hover:via-rose-600/30 group-hover:to-pink-600/30 transition-all duration-300" />
                                    
                                    {/* Content */}
                                    <div className="relative flex items-center justify-center gap-0.5 md:gap-1 lg:gap-1.5">
                                        <div className="flex items-center justify-center w-4 h-4 md:w-5 md:h-5 rounded-md bg-gradient-to-br from-red-500 to-rose-600 shadow-lg shadow-red-500/30 group-hover:shadow-xl group-hover:shadow-red-500/50 transition-all duration-200 shrink-0">
                                            <Trash2
                                                size={9}
                                                className={`md:w-[11px] md:h-[11px] text-white transition-all duration-200 group-hover:scale-110`}
                                                strokeWidth={1.75}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 group-hover:text-white transition-colors duration-200 hidden xl:inline whitespace-nowrap">
                                            Clear
                                        </span>
                                    </div>
                                    
                                    {/* Shine effect on hover */}
                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
                                </motion.button>
                            )}
                        </div>
                    </div>
                    
                    {/* File Upload / Website Upload - Centered in navbar with proper spacing to prevent overlap */}
                    <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center gap-1.5 md:gap-2 z-10 pointer-events-none">
                        <div className="pointer-events-auto">
                            {/* Show text on larger screens, icon-only on smaller screens */}
                            <div className="hidden lg:block">
                                <FileUpload compact={true} showText={true} />
                            </div>
                            <div className="block lg:hidden">
                                <FileUpload compact={true} showText={false} />
                            </div>
                        </div>
                        <div className="pointer-events-auto">
                            <div className="hidden lg:block">
                                <UrlUpload showText={true} />
                            </div>
                            <div className="block lg:hidden">
                                <UrlUpload showText={false} />
                            </div>
                        </div>
                    </div>
                    
                    {/* Right section - Actions with proper spacing */}
                    <div className="chat-header-actions flex items-center gap-1 md:gap-1.5 lg:gap-2 ml-auto shrink-0 z-20 relative">
                        <AuthButton />
                    </div>
                </div>
            </header>

            {/* Content Area - History on Left, Chat on Right */}
            <div className="chat-content-area flex-1 flex overflow-hidden">
                {/* Chat History - Left Sidebar Below Navbar - Responsive */}
                {messages.length > 0 && (
                    <div className="chat-history-sidebar hidden xl:flex w-64 xl:w-80 shrink-0 flex-col border-r border-gray-200 dark:border-gray-800 h-full">
                        <ConversationHistory
                            messages={messages}
                            onMessageClick={handleHistoryClick}
                            selectedIndex={selectedHistoryIndex}
                        />
                    </div>
                )}

                {/* Main Chat Area */}
                <div className="main-chat-area flex-1 flex flex-col min-w-0 overflow-hidden">
                    {/* Clear Chat Confirmation Dialog */}
                    <ConfirmDialog
                        isOpen={showClearDialog}
                        onClose={() => setShowClearDialog(false)}
                        onConfirm={confirmClearChat}
                        title="Clear Chat History"
                        message="Are you sure you want to clear all chat messages? This cannot be undone."
                        confirmText="Clear All"
                        cancelText="Cancel"
                        confirmColor="red"
                    />

                    {/* Condensed Conversation Summary Modal */}
                    <CondenseModal
                        isOpen={showCondenseModal}
                        onClose={() => setShowCondenseModal(false)}
                        summary={conversationSummary}
                        isLoading={isCondensing}
                        error={condenseError}
                        onRegenerate={handleCondense}
                    />

                    <main className="chat-main-content modern-scrollbar flex-1 overflow-y-auto scroll-smooth relative pb-32 pt-4 sm:pt-6">
                        {/* Scrollable content area - Centered */}
                        <div className="chat-messages-wrapper px-4 sm:px-6 md:px-8 lg:px-12 pb-12">
                            {messages.length === 0 ? (
                                <div className="empty-state-container flex min-h-[60vh] flex-col items-center justify-center text-center pt-16 sm:pt-20">
                                    <div className="empty-state-avatar mb-8">
                                        {user?.picture ? (
                                            <div className="relative">
                                                <img
                                                    src={user.picture}
                                                    alt={user.name || 'User'}
                                                    className="h-16 w-16 rounded-full object-cover object-center ring-2 ring-blue-500/30 shadow-xl"
                                                    style={{ objectPosition: 'center center' }}
                                                />
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                                                    <MessageCircle className="w-2.5 h-2.5 text-white" strokeWidth={1.75} />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="relative">
                                                <div className="h-16 w-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-xl shadow-blue-500/20">
                                                    <CircleUser className="h-8 w-8 text-white flex-shrink-0" strokeWidth={1.5} />
                                                </div>
                                                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-950">
                                                    <MessageCircle className="w-2.5 h-2.5 text-white" strokeWidth={1.75} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <h2 className="empty-state-title mb-3 text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
                                        How can I help you today?
                                    </h2>
                                    <p className="empty-state-description mb-10 max-w-md text-gray-500 dark:text-gray-400">
                                        Ask questions about your knowledge base, analyze documents, and extract insights instantly.
                                    </p>

                                    {/* Suggested Questions */}
                                    <div className="suggested-questions-container w-full max-w-3xl mx-auto">
                                        <h3 className="suggested-questions-title flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">
                                            <Lightbulb className="w-4 h-4 text-amber-500" strokeWidth={1.5} />
                                            Try asking:
                                        </h3>
                                        <div className="suggested-questions-grid grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                                            {[
                                                "Summarize the main points of the document",
                                                "What are the key concepts discussed?",
                                                "What does the document say about [topic]?",
                                                "What are the main conclusions?"
                                            ].map((question, qIdx) => (
                                                <button
                                                    key={qIdx}
                                                    onClick={() => handleSend(question)}
                                                    className="suggested-question-button w-full flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-blue-950/20 dark:hover:border-blue-700 transition-all duration-200 group"
                                                >
                                                    <ArrowRight className="w-4 h-4 mt-0.5 shrink-0 text-blue-500 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform" strokeWidth={1.5} />
                                                    <span className="flex-1">{question}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="messages-list space-y-8 pb-6 max-w-[2560px] mx-auto">
                                    {messages.map((msg, i) => (
                                        <div
                                            key={i}
                                            data-message-index={i}
                                            className={`message-item ${selectedHistoryIndex === i ? 'ring-2 ring-blue-500 dark:ring-blue-400 rounded-lg p-1 -m-1' : ''}`}
                                        >
                                            <MessageBubble
                                                message={msg}
                                                messageIndex={i}
                                                onEdit={handleEdit}
                                            />
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="loading-indicator flex items-center gap-2 px-4 py-2 text-gray-400">
                                            <div className="loading-dot h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-600" />
                                            <div className="loading-dot h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-600 delay-75" />
                                            <div className="loading-dot h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-600 delay-150" />
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} className="messages-end-marker" />
                                </div>
                            )}
                        </div>
                    </main>

                    {/* Floating input container - Sticky relative to main chat area */}
                    <div className="chat-input-container sticky bottom-0 z-30 pb-4 sm:pb-6 pt-6 sm:pt-8">
                        <div className="chat-input-wrapper relative flex w-full justify-center px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16">
                            {/* Gradient backdrop with blur */}
                            <div className="chat-input-backdrop absolute inset-0 -top-6 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 backdrop-blur-md" />

                            {/* Floating shadow effect */}
                            <div className="chat-input-shadow absolute inset-0 -top-2 bg-white/50 dark:bg-gray-950/50 rounded-t-3xl shadow-[0_-10px_40px_-10px_rgba(59,130,246,0.15)] dark:shadow-[0_-10px_40px_-10px_rgba(59,130,246,0.1)]" />

                            {/* Animated blue glow effect */}
                            <div className="chat-input-glow absolute inset-0 -top-6 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 animate-pulse" />

                            {/* Input container with floating effect */}
                            <div className="chat-input-inner-container relative w-full transform transition-transform duration-300 hover:scale-[1.01]">
                                <ChatInput
                                    onSend={handleSend}
                                    disabled={isLoading}
                                    initialValue={editContent}
                                    editing={editingIndex !== null}
                                    onCancelEdit={() => {
                                        // Cancel editing - restore original state
                                        setEditingIndex(null);
                                        setEditContent('');
                                        setSelectedHistoryIndex(null);
                                        // Note: Messages weren't removed in handleEdit, so nothing to restore
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Memoize to prevent unnecessary re-renders when parent re-renders
export default memo(ChatInterfaceComponent);
