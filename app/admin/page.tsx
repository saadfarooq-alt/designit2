'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, X, ArrowLeft, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface Design {
  id: string;
  name: string;
  author: string;
  imageData: string;
  status: 'pending' | 'approved' | 'rejected';
}

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Design[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchSubmissions();
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordInput) {
      setPassword(passwordInput);
      setIsAuthenticated(true);
      setLoading(true);
    }
  };

  const fetchSubmissions = async () => {
    try {
      const res = await fetch('/api/submissions?admin=true', {
        headers: {
          'x-admin-password': password // Use the confirmed password
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSubmissions(data);
        setAuthError(false);
      } else {
         // If unauthorized/empty, maybe reset auth
         if (res.status === 401 || res.status === 403) {
           setAuthError(true);
           setIsAuthenticated(false);
         }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatus = async (id: string, status: 'approved' | 'rejected') => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-password': password
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setSubmissions(s => s.map(sub => 
          sub.id === id ? { ...sub, status } : sub
        ));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setProcessing(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
          <h1 className="text-2xl font-bold mb-6 text-center text-slate-800">Admin Login</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-yellow-500 outline-none"
                placeholder="Enter admin password"
              />
            </div>
            {authError && <p className="text-red-500 text-sm">Authentication failed. Please check password.</p>}
            <button
              type="submit"
              className="w-full py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold"
            >
              Login
            </button>
            <Link href="/" className="block text-center text-slate-400 text-sm hover:text-slate-600">
              Back to Studio
            </Link>
          </form>
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-yellow-500">
      <Loader2 className="animate-spin w-10 h-10" />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 border-b-4 border-[#B87333] sticky top-0 z-10 px-8 py-4 flex items-center justify-between shadow-md">
        <Link 
          href="/" 
          className="flex items-center gap-2 text-white hover:text-yellow-100 transition-colors font-medium drop-shadow-sm"
        >
          <ArrowLeft size={20} />
          Studio
        </Link>
        <h1 className="text-xl font-bold text-white drop-shadow-md flex items-center gap-2">
          Submission Moderation <span className="text-[#e11d48]">♦</span>
        </h1>
        <div className="w-20" />
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <div className="space-y-6">
          {submissions.length === 0 && (
            <p className="text-center text-slate-400 py-12 text-lg">No submissions found.</p>
          )}

          {submissions.map((sub) => (
            <div 
              key={sub.id} 
              className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row items-center gap-8 transition-colors ${
                sub.status === 'approved' ? 'border-l-4 border-l-green-500' :
                sub.status === 'rejected' ? 'border-l-4 border-l-red-500' :
                'border-l-4 border-l-yellow-400'
              }`}
            >
              <div className="relative w-full md:w-48 h-48 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-100">
                <Image 
                  src={sub.imageData} 
                  alt={sub.name}
                  fill
                  className="object-contain p-2"
                />
              </div>

              <div className="flex-1 min-w-0 text-center md:text-left">
                <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                  <h3 className="text-xl font-bold text-slate-800 truncate">{sub.name}</h3>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider
                    ${sub.status === 'approved' ? 'bg-green-100 text-green-700' : 
                      sub.status === 'rejected' ? 'bg-red-100 text-red-700' : 
                      'bg-yellow-100 text-yellow-700'}`}>
                    {sub.status}
                  </span>
                </div>
                <p className="text-slate-500 mb-4">by <span className="font-semibold text-slate-700">{sub.author}</span></p>
                
                <div className="flex items-center justify-center md:justify-start gap-4">
                  {sub.status !== 'approved' && (
                    <button
                      onClick={() => handleStatus(sub.id, 'approved')}
                      disabled={!!processing}
                      className="px-6 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-lg font-medium transition-colors flex items-center gap-2 border border-green-200"
                    >
                      {processing === sub.id ? <Loader2 className="animate-spin w-4 h-4"/> : <Check size={18} />}
                      Approve
                    </button>
                  )}
                  
                  {sub.status !== 'rejected' && (
                    <button
                      onClick={() => handleStatus(sub.id, 'rejected')}
                      disabled={!!processing}
                      className="px-6 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg font-medium transition-colors flex items-center gap-2 border border-red-200"
                    >
                      {processing === sub.id ? <Loader2 className="animate-spin w-4 h-4" /> : <X size={18} />}
                      Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
