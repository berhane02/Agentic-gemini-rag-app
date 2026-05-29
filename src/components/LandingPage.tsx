'use client';

import { Sparkles, Zap, Shield, BookMarked } from 'lucide-react';
import { useUserContext } from '@/contexts/UserContext';
import { useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export default function LandingPage() {
    const { user } = useUserContext();
    const clerk = useClerk();
    const router = useRouter();
    const handleLogin = useCallback(() => {
        if (user) {
            router.replace('/chat');
            return;
        }
        clerk.openSignIn({ redirectUrl: '/chat' });
    }, [user, router, clerk]);

    const handleSignUp = useCallback(() => {
        if (user) {
            router.replace('/chat');
            return;
        }
        clerk.openSignUp({ redirectUrl: '/chat' });
    }, [user, router, clerk]);
    
    const handleGoToChat = useCallback(() => {
        router.replace('/chat');
    }, [router]);

    return (
        <div className="landing-page-container min-h-screen w-full bg-[#060609] flex flex-col relative overflow-hidden">
            {/* Grid pattern */}
            <div className="landing-page-background-pattern absolute inset-0 opacity-[0.04]" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '64px 64px'
            }}></div>
            {/* Ambient glow blobs */}
            <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />
            <div className="absolute top-[40%] left-[40%] w-[30vw] h-[30vw] max-w-[400px] max-h-[400px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none" />

            {/* Top Navigation Bar */}
            <nav className="landing-page-navbar relative z-10 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-center justify-between backdrop-blur-sm bg-white/5 border-b border-white/5">
                {/* Logo with Dropdown */}
                <div className="landing-page-logo flex items-center gap-2 cursor-pointer group">
                    <div className="landing-page-logo-icon-wrapper relative">
                        <div className="landing-page-logo-icon-bg absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-lg blur-sm"></div>
                        <div className="landing-page-logo-icon relative w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" strokeWidth={1.5} />
                        </div>
                    </div>
                    <span className="landing-page-logo-text text-white font-semibold text-base sm:text-lg tracking-tight">RAG Chatbot</span>
                </div>

                {/* Action Buttons */}
                <div className="landing-page-nav-actions flex items-center gap-2 sm:gap-3">
                    {!user && (
                        <>
                            <button
                                onClick={handleSignUp}
                                className="landing-page-signup-button px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-medium text-white border border-white/20 rounded-xl hover:border-white/40 hover:bg-white/10 backdrop-blur-sm"
                            >
                                Sign up for free
                            </button>
                            <button
                                onClick={handleLogin}
                                className="landing-page-login-button px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/20"
                            >
                                Log in
                            </button>
                        </>
                    )}
                    {user && (
                        <button
                            onClick={handleGoToChat}
                            className="landing-page-go-to-chat-button px-4 sm:px-5 py-2 sm:py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/20"
                        >
                            Go to Chat
                        </button>
                    )}
                </div>
            </nav>

            {/* Main Content Area - Centered */}
            <div className="landing-page-main-content relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
                {/* Central Prompt */}
                <div className="landing-page-prompt-container mb-10 sm:mb-14 lg:mb-16 max-w-5xl">
                    <div className="landing-page-prompt-badge mb-6 flex justify-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                            <span className="text-xs sm:text-sm text-white/70 font-medium">AI Document & Image Analysis</span>
                        </div>
                    </div>
                    <h1 className="landing-page-prompt-text text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-semibold text-white text-center leading-[1.1] mb-4 tracking-tight">
                        <span className="bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent">
                            Personal Agent assistant
                        </span>
                    </h1>
                    <p className="landing-page-prompt-subtitle text-lg sm:text-xl md:text-2xl text-white/60 text-center max-w-2xl mx-auto leading-relaxed">
                        Analyze documents and scan images to extract insights. Ask questions, get instant answers, and streamline your workflow.
                    </p>
                </div>

                {/* Features Grid */}
                <div className="landing-page-features mt-16 sm:mt-20 lg:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 max-w-5xl w-full">
                    {[
                        {
                            Icon: Zap,
                            gradient: 'from-amber-500 to-orange-500',
                            glow: 'shadow-amber-500/25',
                            title: 'Lightning Fast',
                            desc: 'Instant responses powered by AI'
                        },
                        {
                            Icon: Shield,
                            gradient: 'from-emerald-500 to-teal-500',
                            glow: 'shadow-emerald-500/25',
                            title: 'Secure & Private',
                            desc: 'Your data stays protected'
                        },
                        {
                            Icon: BookMarked,
                            gradient: 'from-blue-500 to-indigo-500',
                            glow: 'shadow-blue-500/25',
                            title: 'Knowledge Base',
                            desc: 'Access all your documentation'
                        }
                    ].map((feature, idx) => (
                        <div
                            key={idx}
                            className="landing-page-feature-card group p-6 sm:p-8 rounded-2xl bg-white/4 border border-white/8 backdrop-blur-sm hover:bg-white/7 hover:border-white/15 transition-all duration-300"
                        >
                            <div className={`landing-page-feature-icon inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg ${feature.glow} mb-5`}>
                                <feature.Icon className="w-5 h-5 text-white" strokeWidth={1.75} />
                            </div>
                            <h3 className="landing-page-feature-title text-lg sm:text-xl font-semibold text-white mb-2">{feature.title}</h3>
                            <p className="landing-page-feature-desc text-sm sm:text-base text-white/50 leading-relaxed">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
