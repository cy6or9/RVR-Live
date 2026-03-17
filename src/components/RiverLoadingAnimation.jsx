// RiverLoadingAnimation.jsx
// Animated loading screen with checklist and water wheel

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';

const loadingSteps = [
  { text: 'Loading Profile...', delay: 0 },
  { text: 'Tracing Ohio River...', delay: 800 },
  { text: 'Fetching River Conditions...', delay: 1600 },
  { text: 'Preparing Map Data...', delay: 2400 },
];

export default function RiverLoadingAnimation({ userName }) {
  const [completedSteps, setCompletedSteps] = useState([]);

  useEffect(() => {
    loadingSteps.forEach((step, index) => {
      setTimeout(() => {
        setCompletedSteps((prev) => [...prev, index]);
      }, step.delay);
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="max-w-md w-full px-6">
        {/* Logo or Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200 mb-2">
            River Valley Report
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Preparing your river data...
          </p>
        </div>

        {/* Loading Checklist */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 mb-8">
          <div className="space-y-4">
            {loadingSteps.map((step, index) => {
              const isCompleted = completedSteps.includes(index);
              const isActive = completedSteps.length === index;
              
              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 transition-all duration-500 ${
                    isActive ? 'opacity-100 scale-100' : isCompleted ? 'opacity-60' : 'opacity-30'
                  }`}
                >
                  {/* Checkbox */}
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      isCompleted
                        ? 'bg-emerald-500 scale-100'
                        : 'bg-slate-200 dark:bg-slate-700 scale-90'
                    }`}
                  >
                    {isCompleted && (
                      <Check className="w-4 h-4 text-white animate-in zoom-in duration-300" />
                    )}
                  </div>

                  {/* Step Text */}
                  <span
                    className={`text-sm font-medium transition-colors duration-300 ${
                      isCompleted
                        ? 'text-slate-600 dark:text-slate-400'
                        : isActive
                        ? 'text-slate-900 dark:text-slate-100'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {step.text.replace('$User$', userName || 'your')}
                  </span>

                  {/* Loading Spinner for active step */}
                  {isActive && !isCompleted && (
                    <div className="ml-auto">
                      <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Water Wheel Animation */}
        <div className="flex justify-center">
          <div className="relative w-32 h-32">
            {/* Waterfall behind wheel */}
            <div className="absolute inset-x-0 top-0 h-full overflow-hidden">
              <div className="water-flow">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="water-stream"
                    style={{ animationDelay: `${i * 0.3}s` }}
                  />
                ))}
              </div>
            </div>

            {/* Water Wheel */}
            <div className="relative z-10">
              <svg
                viewBox="0 0 100 100"
                className="w-full h-full animate-spin-slow"
                style={{ animationDuration: '3s' }}
              >
                {/* Wheel center circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="35"
                  fill="#1e293b"
                  stroke="#10b981"
                  strokeWidth="2"
                />
                
                {/* Wheel spokes */}
                {[...Array(8)].map((_, i) => {
                  const angle = (i * 45 * Math.PI) / 180;
                  const x1 = 50 + 15 * Math.cos(angle);
                  const y1 = 50 + 15 * Math.sin(angle);
                  const x2 = 50 + 35 * Math.cos(angle);
                  const y2 = 50 + 35 * Math.sin(angle);
                  
                  return (
                    <line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#10b981"
                      strokeWidth="2"
                    />
                  );
                })}

                {/* Outer wheel paddles */}
                {[...Array(8)].map((_, i) => {
                  const angle = (i * 45 * Math.PI) / 180;
                  const x = 50 + 35 * Math.cos(angle);
                  const y = 50 + 35 * Math.sin(angle);
                  
                  return (
                    <rect
                      key={i}
                      x={x - 3}
                      y={y - 8}
                      width="6"
                      height="16"
                      fill="#10b981"
                      transform={`rotate(${i * 45}, ${x}, ${y})`}
                      opacity="0.8"
                    />
                  );
                })}

                {/* Center hub */}
                <circle cx="50" cy="50" r="8" fill="#10b981" />
              </svg>
            </div>

            {/* Water splash at bottom */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-24 h-8 overflow-hidden">
              <div className="water-splash" />
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes water-flow {
          0% {
            transform: translateY(-100%);
            opacity: 0;
          }
          20% {
            opacity: 0.6;
          }
          100% {
            transform: translateY(100%);
            opacity: 0;
          }
        }

        @keyframes splash {
          0%, 100% {
            transform: scaleX(0.8) scaleY(1);
            opacity: 0.3;
          }
          50% {
            transform: scaleX(1.2) scaleY(0.8);
            opacity: 0.6;
          }
        }

        .water-stream {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: 3px;
          height: 20px;
          background: linear-gradient(to bottom, transparent, #3b82f6, transparent);
          animation: water-flow 1.5s ease-in-out infinite;
        }

        .water-splash {
          width: 100%;
          height: 100%;
          background: radial-gradient(
            ellipse at center,
            rgba(59, 130, 246, 0.4) 0%,
            rgba(59, 130, 246, 0.2) 50%,
            transparent 70%
          );
          animation: splash 1.5s ease-in-out infinite;
        }

        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        .animate-spin-slow {
          animation: spin-slow 3s linear infinite;
        }
      `}</style>
    </div>
  );
}
