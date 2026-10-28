import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import * as THREE from "three";
import { ArrowRight, ChevronRight, Activity, ShieldCheck, Zap, Plus } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

gsap.registerPlugin(ScrollTrigger);

export default function Landing() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();
  const { uiState } = useAppStore();
  const reducedMotion = !uiState.animationsEnabled || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // Custom cursor references
  const dotRef = useRef(null);
  const ringRef = useRef(null);

  // States
  const [faqsOpen, setFaqsOpen] = useState({});

  useEffect(() => {
    // ----------------------------------------
    // PHASE 4: GLOBAL INTERACTION SYSTEM
    // ----------------------------------------

    // Custom Cursor Logic
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    let ringPos = { x: 0, y: 0 };
    let requestRef;

    if (!isMobile && !reducedMotion) {
      const handleMouseMove = (e) => {
        gsap.set(dotRef.current, { x: e.clientX, y: e.clientY });
      };
      window.addEventListener("mousemove", handleMouseMove);

      const renderRing = () => {
        const dotX = dotRef.current?._gsap?.x || 0;
        const dotY = dotRef.current?._gsap?.y || 0;
        
        ringPos.x += (dotX - ringPos.x) * 0.12;
        ringPos.y += (dotY - ringPos.y) * 0.12;
        
        gsap.set(ringRef.current, { x: ringPos.x, y: ringPos.y });
        requestRef = requestAnimationFrame(renderRing);
      };
      requestRef = requestAnimationFrame(renderRing);

      // Interactive states for cursor
      const interactives = document.querySelectorAll("button, a, input, [data-magnetic]");
      interactives.forEach(el => {
        el.addEventListener("mouseenter", () => {
          gsap.to(ringRef.current, { width: 60, height: 60, mixBlendMode: "exclusion", marginLeft: -30, marginTop: -30, duration: 0.3 });
        });
        el.addEventListener("mouseleave", () => {
          gsap.to(ringRef.current, { width: 32, height: 32, mixBlendMode: "normal", marginLeft: -16, marginTop: -16, duration: 0.3 });
        });
      });
      document.body.addEventListener("mousedown", () => gsap.to(dotRef.current, { scale: 0.6, duration: 0.1 }));
      document.body.addEventListener("mouseup", () => gsap.to(dotRef.current, { scale: 1, duration: 0.1 }));
    }

    // Smooth Scroll Sync
    let lenis = null;
    if (!reducedMotion) {
      lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
      });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // Initial wipe transition and animations
    const ctx = !reducedMotion ? gsap.context(() => {
      // 1. Enter Sequence
      const masterTl = gsap.timeline();
      masterTl.fromTo(".wipe-overlay", 
        { y: 0 }, 
        { y: "-100%", duration: 0.8, ease: "power2.inOut", delay: 0.5 }
      );
      
      masterTl.fromTo(".hero-stagger", 
        { opacity: 0, y: 50 }, 
        { opacity: 1, y: 0, stagger: 0.12, ease: "power2.out", duration: 0.9 }, 
        "-=0.3"
      );

      // Hero Canvas Fade In
      gsap.to(canvasRef.current, { opacity: 0.4, duration: 1.5, delay: 0.8 });

      // Features Cards stagger
      gsap.from(".feature-card", {
        scrollTrigger: { trigger: ".features-section", start: "top 75%" },
        opacity: 0, y: 60, stagger: 0.15, ease: "power2.out", duration: 0.8
      });

      // Steps connect line
      gsap.to(".journey-line", {
        scrollTrigger: { trigger: ".how-it-works-section", start: "top 60%", end: "bottom 80%", scrub: true },
        strokeDashoffset: 0
      });

      gsap.from(".step-card", {
        scrollTrigger: { trigger: ".how-it-works-section", start: "top 75%" },
        opacity: 0, y: 40, stagger: 0.2, duration: 0.8
      });

      // Philosophy Word-by-Word
      gsap.from(".philo-word", {
        scrollTrigger: { trigger: ".philosophy-text", start: "top 80%", toggleActions: "play none none none" },
        opacity: 0, y: 20, stagger: 0.04, duration: 0.6, ease: "power2.out"
      });

      // Final CTA
      gsap.fromTo(".final-cta-content", 
        { scale: 0.95, opacity: 0 },
        { scrollTrigger: { trigger: ".final-cta-section", start: "top 75%" }, scale: 1, opacity: 1, duration: 0.8, ease: "power2.out" }
      );

      // Navbar intersection observer
      const observer = new IntersectionObserver(
        ([e]) => {
          const nav = document.querySelector(".floating-nav");
          if (nav) {
            if (e.intersectionRatio < 0.9) {
              nav.classList.add("backdrop-blur-xl", "bg-[#050914]/70", "border", "border-white/10");
            } else {
              nav.classList.remove("backdrop-blur-xl", "bg-[#050914]/70", "border", "border-white/10");
            }
          }
        },
        { threshold: [0.9] }
      );
      const heroSec = document.querySelector(".hero-section");
      if(heroSec) observer.observe(heroSec);

      // Magnetic Buttons
      const magneticBtns = document.querySelectorAll(".magnetic-btn");
      magneticBtns.forEach(el => {
        el.addEventListener("mousemove", (e) => {
          const rect = el.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          gsap.to(el, { x: x * 0.25, y: y * 0.25, duration: 0.4, ease: "power2.out" });
        });
        el.addEventListener("mouseleave", () => {
          gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: "elastic.out(1, 0.4)" });
        });
      });
    }, containerRef) : null;

    // ----------------------------------------
    // THREE.JS HERO CANVAS
    // ----------------------------------------
    let scene, camera, renderer, particles;
    const initThree = () => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);

      // Abstract Particle Field Reacting to Mouse
      const particlesGeometry = new THREE.BufferGeometry();
      const particlesCount = 800;
      const posArray = new Float32Array(particlesCount * 3);
      
      for(let i = 0; i < particlesCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 15;
      }
      particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
      const material = new THREE.PointsMaterial({ size: 0.03, color: '#53B6FF', transparent: true, opacity: 0.6 });
      particles = new THREE.Points(particlesGeometry, material);
      scene.add(particles);

      camera.position.z = 4;
      
      const mouse = { x: 0, y: 0 };
      document.addEventListener('mousemove', (event) => {
        mouse.x = (event.clientX / window.innerWidth) - 0.5;
        mouse.y = -(event.clientY / window.innerHeight) + 0.5;
      });

      const tick = () => {
        particles.rotation.y += 0.001;
        particles.rotation.x += 0.0005;
        
        // Mouse reactivity lerp
        particles.rotation.y += (mouse.x * 0.5 - particles.rotation.y) * 0.02;
        particles.rotation.x += (-mouse.y * 0.5 - particles.rotation.x) * 0.02;

        renderer.render(scene, camera);
        requestAnimationFrame(tick);
      };
      tick();
    };

     if (!reducedMotion) {
       initThree();
    }

    const handleResize = () => {
      if(camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      if (ctx) ctx.revert();
      if (lenis) {
        lenis.destroy();
        gsap.ticker.remove(lenis.raf);
      }
      cancelAnimationFrame(requestRef);
      window.removeEventListener('resize', handleResize);
    };
  }, [reducedMotion]);

  const toggleFaq = (idx) => {
    setFaqsOpen(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#050914] text-[#e6efff] font-['Space_Grotesk'] overflow-hidden selection:bg-[#53B6FF]/30">
      
      {/* 
        <!-- BRAND BRAIN -->
        1.1 Business Profile: B2B/B2C Legal Intelligence Tool. Early stage building credibility, B2B compliance officers and B2C workers. Trust-building cycle requires visible proofs.
        1.2 Customer Archetype: Workers / Compliance reps who fear legal jargon and AI hallucination. Want to feel secure, empowered, and certain.
        1.3 Core Psychological Lever: Safety / Social Proof.
        1.4 Industry-Appropriate Trust Signals: Precise source citations, direct legal text, minimal noise.
        1.5 Copy Tone Rules: Short sentences. Confident not shouting. Focus on verifiable answers. 
        1.6 Animation Intensity: Moderate to Technical. Purposeful reveals, data-feel.
        1.7 3D Element: Abstract particle field mapping legal unstructured data into ordered signals.
        1.8 Sections: Hero, Social Proof, Features, How it Works, Philosophy, FAQ, Final CTA.
      */}

      {/* Global Noise / Wipe overlays */}
      <div className="fixed inset-0 pointer-events-none z-[9999] opacity-[0.04]" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
      <div className="wipe-overlay fixed inset-0 bg-[#050914] z-[10000]"></div>

      {/* Custom Cursor HTML */}
      <div className="hidden md:block">
        <div ref={dotRef} className="fixed top-0 left-0 w-2 h-2 bg-[#53B6FF] rounded-full point-events-none z-[9998] -ml-1 -mt-1 pointer-events-none" />
        <div ref={ringRef} className="fixed top-0 left-0 w-8 h-8 rounded-full border border-[#53B6FF]/30 point-events-none z-[9997] -ml-4 -mt-4 transition-transform duration-75 pointer-events-none" />
      </div>

      {/* FLOATING NAVBAR */}
      <nav className="floating-nav fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between px-6 py-3 rounded-full transition-all duration-400 ease w-[90%] max-w-5xl">
        <div className="font-bold tracking-wide text-lg">AdhikarAI</div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
          <a href="#features" className="hover:text-white transition-colors">Capabilities</a>
          <a href="#process" className="hover:text-white transition-colors">Process</a>
          <a href="#manifesto" className="hover:text-white transition-colors">Manifesto</a>
        </div>
        <button onClick={() => navigate("/chat")} className="magnetic-btn bg-white/10 hover:bg-white/20 border border-white/10 px-5 py-2 rounded-full text-sm font-medium transition-colors pointer-events-auto cursor-pointer">
          Launch Interface
        </button>
      </nav>

      {/* SECTION: HERO */}
      <section className="hero-section relative h-[100dvh] w-full flex items-end pb-20 md:pb-28 pl-6 md:pl-20 border-b border-white/5">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-0 opacity-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#050914] via-[#050914]/60 to-transparent z-10" />
        
        <div className="relative z-20 max-w-4xl space-y-6">
          <p className="hero-stagger text-[#70f0cb] font-mono text-sm tracking-widest uppercase">System Online // Version 1.0</p>
          <h1 className="hero-stagger text-5xl md:text-8xl font-medium tracking-tight leading-[1.05]">
            <span className="opacity-90">Labor Law, </span>
            <br className="max-md:hidden"/>
            <i className="font-serif text-[#53b6ff]">grounded in evidence.</i>
          </h1>
          <p className="hero-stagger text-lg md:text-xl text-slate-400 max-w-xl pr-4">
            A precise inference engine engineered to parse Indian legislation, eliminate hallucinations, and return cited truths.
          </p>
          <div className="hero-stagger pt-4">
             <button onClick={() => navigate("/chat")} className="magnetic-btn flex items-center gap-2 bg-[#53B6FF]/10 text-[#53B6FF] hover:bg-[#53B6FF]/20 border border-[#53B6FF]/30 px-8 py-4 rounded-2xl font-medium transition-colors pointer-events-auto cursor-pointer">
               Initiate Query <ArrowRight size={18} />
             </button>
          </div>
        </div>
      </section>

      {/* SECTION: SOCIAL_PROOF_BAR */}
      <section className="relative py-10 border-b border-white/5 overflow-hidden flex items-center">
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-[#050914] to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-[#050914] to-transparent z-10" />
        
        <div className="flex whitespace-nowrap overflow-hidden opacity-50">
          <div className="animate-[scroll_40s_linear_infinite] flex items-center gap-16 px-8">
            <span className="font-mono text-sm">• 0% HALLUCINATION TARGET</span>
            <span className="font-mono text-sm">RETRIEVAL AUGMENTED</span>
            <span className="font-mono text-sm">• BUILT ON FAISS & BM25</span>
            <span className="font-mono text-sm">CROSS-ENCODER RERANKING</span>
            <span className="font-mono text-sm">• LIVE TRACEABILITY</span>
            {/* Duplicated for seamless loop */}
            <span className="font-mono text-sm">• 0% HALLUCINATION TARGET</span>
            <span className="font-mono text-sm">RETRIEVAL AUGMENTED</span>
            <span className="font-mono text-sm">• BUILT ON FAISS & BM25</span>
            <span className="font-mono text-sm">CROSS-ENCODER RERANKING</span>
            <span className="font-mono text-sm">• LIVE TRACEABILITY</span>
          </div>
        </div>
      </section>

      {/* SECTION: TRUST + OUTCOMES */}
      <section className="py-24 px-6 md:px-20 border-b border-white/5 bg-[#070B16]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
          <div>
            <p className="text-[#53B6FF] font-mono text-xs tracking-widest uppercase mb-4">Why teams trust AdhikarAI</p>
            <h3 className="text-3xl md:text-4xl font-medium leading-tight">Built for legal confidence, not flashy guesswork.</h3>
            <p className="text-slate-400 mt-5 max-w-xl leading-relaxed">
              Every answer is expected to be source-cited, confidence-scored, and operationally transparent. This is legal-tech UX designed for credibility under scrutiny.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#53B6FF]/25 bg-[#53B6FF]/10 p-5">
              <p className="text-[10px] uppercase tracking-widest text-[#53B6FF]">Evidence First</p>
              <p className="text-xl mt-2">Act + Section citations</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Worker Clarity</p>
              <p className="text-xl mt-2">Plain-language mode</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-[10px] uppercase tracking-widest text-slate-400">Portfolio Signal</p>
              <p className="text-xl mt-2">Live telemetry + traceability</p>
            </div>
            <div className="rounded-2xl border border-[#70f0cb]/25 bg-[#70f0cb]/10 p-5">
              <p className="text-[10px] uppercase tracking-widest text-[#70f0cb]">Attachment Aware</p>
              <p className="text-xl mt-2">OCR + PDF extraction flow</p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: FEATURES */}
      <section id="features" className="features-section py-32 px-6 md:px-20 max-w-[1400px] mx-auto">
        <div className="mb-20">
          <p className="text-[#53B6FF] font-mono text-sm tracking-widest uppercase mb-4">Functional Capabilities</p>
          <h2 className="text-4xl md:text-5xl font-medium max-w-2xl">Architected for absolute legal certainty.</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="feature-card relative bg-[#0F0F1A]/60 border border-white/10 rounded-[2rem] p-8 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:text-[#53B6FF]/20 transition-colors">
              <Activity size={120} strokeWidth={1} />
            </div>
            <div className="relative z-10 h-full flex flex-col justify-end min-h-[300px]">
              <div className="mb-8 font-mono text-[#53B6FF] text-sm animate-pulse tracking-wide">
                [ ELI5 PARSER ACTIVE ]
              </div>
              <h3 className="text-2xl font-semibold mb-3">Complex Text Translated</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Legalese is decoded automatically. Toggle between Lawyer, Worker, or Simple modes to receive explanations formulated for your precise domain context.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="feature-card relative bg-[#0F0F1A]/60 border border-white/10 rounded-[2rem] p-8 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:text-[#70f0cb]/20 transition-colors">
              <ShieldCheck size={120} strokeWidth={1} />
            </div>
            <div className="relative z-10 h-full flex flex-col justify-end min-h-[300px]">
              <div className="mb-8 font-mono text-[#70f0cb] text-sm tracking-wide">
                 • NO HEURISTIC GUESSING
              </div>
              <h3 className="text-2xl font-semibold mb-3">Zero Hallucination Tolerance</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Answers are synthesized exclusively from retrieved statutory passages. If the evidence threshold is not met, the system explicitly refuses to guess.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="feature-card relative bg-[#0F0F1A]/60 border border-white/10 rounded-[2rem] p-8 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 text-white/5 group-hover:text-white/10 transition-colors">
              <Zap size={120} strokeWidth={1} />
            </div>
            <div className="relative z-10 h-full flex flex-col justify-end min-h-[300px]">
               <div className="mb-8 font-mono text-white/40 text-sm tracking-wide">
                 {`{ ACT_SECTION_ID }`}
              </div>
              <h3 className="text-2xl font-semibold mb-3">Immutable Citations</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Verification is built-in. Every inference is appended with the exact source Act, Section, and snippet utilized to formulate the response.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: HOW IT WORKS */}
      <section id="process" className="how-it-works-section relative py-32 px-6 md:px-20 bg-white/[0.02] border-y border-white/5">
        <div className="max-w-[1400px] mx-auto text-center mb-24">
           <h2 className="text-4xl md:text-5xl font-medium tracking-tight">The Telemetry Pipeline.</h2>
        </div>

        <div className="max-w-5xl mx-auto relative px-4">
          {/* Animated Connecting Line */}
          <svg className="hidden md:block absolute top-12 left-[10%] right-[10%] w-[80%] h-[2px] z-0 overflow-visible" preserveAspectRatio="none">
             <line x1="0" y1="0" x2="100%" y2="0" stroke="rgba(83, 182, 255, 0.3)" strokeWidth="2" strokeDasharray="12 12" className="journey-line" style={{ strokeDashoffset: 1000, strokeDasharray: "1000 1000" }}></line>
          </svg>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8 relative z-10">
            {[ 
              { num: "01", title: "Dual Retrieval Phase", desc: "Lexical keyword search and dense semantic search run concurrently." },
              { num: "02", title: "Cross-Encoder Fusion", desc: "Results are reranked, isolating precise answers rather than tangential concepts." },
              { num: "03", title: "Inference & Stream", desc: "Context injected exclusively into LLM. Output streamed live with sources appended." }
            ].map((step, i) => (
              <div key={i} className="step-card flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-[2rem] bg-[#050914] border border-[#53B6FF]/30 flex items-center justify-center font-mono text-4xl text-[#53B6FF] mb-6 shadow-[0_0_30px_rgba(83,182,255,0.1)]">
                  {step.num}
                </div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed max-w-[280px]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: PHILOSOPHY */}
      <section id="manifesto" className="philosophy-section relative min-h-screen flex items-center justify-center overflow-hidden py-32 px-6">
        <div className="philosophy-texture absolute inset-0 z-0 opacity-10" style={{ 
          backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }} />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center philosophy-text">
          <p className="text-slate-400 text-lg md:text-xl mb-6">
            {"Most legal platforms focus on: indexing static databases without guidance.".split(" ").map((w, i) => <span key={i} className="philo-word inline-block mr-1">{w}</span>)}
          </p>
          <p className="text-4xl md:text-6xl font-serif italic text-white/90 leading-tight">
            {"We focus on: ".split(" ").map((w, i) => <span key={i} className="philo-word inline-block mr-2">{w}</span>)}
            <span className="text-[#53B6FF] font-medium not-italic">
              {"grounded verifiability ".split(" ").map((w, i) => <span key={i} className="philo-word inline-block mr-2">{w}</span>)}
            </span>
            {"over AI confidence.".split(" ").map((w, i) => <span key={'z'+i} className="philo-word inline-block mr-2">{w}</span>)}
          </p>
        </div>
      </section>

      {/* SECTION: STATS (Proof Bar) */}
      <section className="py-24 border-y border-white/5 bg-[#0F0F1A]/40">
        <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
          <div className="px-4">
             <div className="stat-counter text-6xl md:text-7xl font-semibold tracking-tighter text-white mb-2" data-target="93">0</div>
             <p className="text-slate-400">Max Confidence Cap (%)</p>
          </div>
          <div className="px-4 pt-8 md:pt-0">
             <div className="stat-counter text-6xl md:text-7xl font-semibold tracking-tighter text-white mb-2" data-target="15">0</div>
             <p className="text-slate-400">Dynamic Context Sources</p>
          </div>
          <div className="px-4 pt-8 md:pt-0">
             <div className="text-6xl md:text-7xl font-semibold tracking-tighter text-[#70f0cb] mb-2"><span className="stat-counter" data-target="100">0</span>%</div>
             <p className="text-slate-400">Traceable Assertions</p>
          </div>
        </div>
      </section>

      {/* SECTION: FAQ */}
      <section className="py-32 px-6 md:px-20 max-w-[900px] mx-auto">
        <h2 className="text-4xl font-medium tracking-tight mb-12 text-center">System Parameters</h2>
        <div className="space-y-4">
          {[
            { q: "How is the data securely ingested?", a: "Documents are parsed, cleaned of optical noise, and systematically chunked into our vector databases. All legal sources are immutable." },
            { q: "Is the LLM generating new laws?", a: "No. The system utilizes rigorous prompt structures instructing the model exclusively to parse retrieved text. Any deviation guarantees generation failure." },
            { q: "What happens if a query has no legal precedent?", a: "The system actively intercepts the failure mode, responding explicitly with 'not enough information' rather than fabricating a confident response." },
            { q: "Can I verify the context blocks used?", a: "Yes. In the interface, activating the Debug mode exposes latency routing, confidence realities, and exact token usages per inference." }
          ].map((item, idx) => (
            <div key={idx} className="border border-white/10 bg-white/[0.01] rounded-2xl overflow-hidden cursor-pointer" onClick={() => toggleFaq(idx)}>
              <div className="px-6 py-5 flex items-center justify-between">
                <h4 className="font-semibold">{item.q}</h4>
                <div className={`transition-transform duration-300 ${faqsOpen[idx] ? 'rotate-45 text-[#53B6FF]' : 'text-slate-400'}`}>
                  <Plus size={20} />
                </div>
              </div>
              <div className={`px-6 overflow-hidden transition-all duration-300 ${faqsOpen[idx] ? 'max-h-40 pb-5 opacity-100' : 'max-h-0 opacity-0'}`}>
                <p className="text-slate-400 text-sm leading-relaxed">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION: FINAL CTA */}
      <section className="final-cta-section py-40 px-6 bg-[#53B6FF]/5 border-t border-[#53B6FF]/20 relative overflow-hidden text-center">
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#53B6FF]/10 via-transparent to-transparent"></div>
        <div className="final-cta-content relative z-10 max-w-3xl mx-auto text-center space-y-8 flex flex-col items-center">
          <h2 className="text-6xl md:text-8xl font-serif italic tracking-tight leading-[0.9]">
            Begin Inference. 
          </h2>
          <p className="text-slate-300 text-lg md:text-xl max-w-xl mx-auto">
            Experience Indian Labour Law queried reliably, with full source transparency and localized generation constraints.
          </p>
          <button onClick={() => navigate("/chat")} className="magnetic-btn bg-white text-black hover:bg-slate-200 px-10 py-5 rounded-2xl font-bold transition-colors tracking-wide text-lg flex items-center gap-3">
             Launch Workspace <ChevronRight size={20} />
          </button>
        </div>
      </section>

      {/* SECTION: FOOTER */}
      <footer className="bg-[#03060C] pt-20 pb-10 px-6 md:px-20 rounded-t-[3.5rem] border-t border-white/10">
         <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
           <div className="md:col-span-2 space-y-4">
              <div className="font-bold tracking-wide text-2xl mb-2">AdhikarAI</div>
              <p className="text-slate-500 max-w-sm text-sm leading-relaxed">
                A demonstrative RAG system constructed to navigate Indian Labor Law securely. Grounded retrieval architecture.
              </p>
           </div>
           <div>
              <p className="font-mono text-sm tracking-widest uppercase mb-4 text-[#53B6FF]">Platform</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li><Link to="/chat" className="hover:text-white transition-colors">Workspace</Link></li>
                <li><Link to="/sessions" className="hover:text-white transition-colors">History Index</Link></li>
                <li><Link to="/setup" className="hover:text-white transition-colors">Model Setup</Link></li>
              </ul>
           </div>
           <div>
              <p className="font-mono text-sm tracking-widest uppercase mb-4 text-[#53B6FF]">Legal Trace</p>
              <ul className="space-y-2 text-sm text-slate-400">
                <li>Privacy Directive</li>
                <li>Usage Restitution</li>
              </ul>
           </div>
         </div>
         <div className="max-w-[1400px] mx-auto pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <p>Copyright © {new Date().getFullYear()} AdhikarAI Systems.</p>
            <div className="px-4 py-2 rounded-full border border-green-500/30 bg-green-500/10 text-green-400 flex items-center gap-2 font-mono">
               <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
               SYSTEM OPERATIONAL
            </div>
         </div>
      </footer>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}} />
    </div>
  );
}
