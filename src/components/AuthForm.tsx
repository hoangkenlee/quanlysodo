import React, { useState } from 'react';
import { getSupabase } from '../lib/supabase';
import { Mail, Lock, LogIn, UserPlus, HelpCircle, Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface AuthFormProps {
  onSuccess: () => void;
}

export const AuthForm: React.FC<AuthFormProps> = ({ onSuccess }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isPasswordValid = password.trim().length >= 6;
  const isPasswordMatch = mode === 'signup' ? password === confirmPassword : true;
  const canSubmit = mode === 'signup' ? (isPasswordValid && isPasswordMatch && email.includes('@')) : (email.includes('@') && password.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = getSupabase();
      
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ 
          email: email.trim(), 
          password: password.trim() 
        });
        if (error) throw error;
        onSuccess();
      } else if (mode === 'signup') {
        const { error, data } = await supabase.auth.signUp({ 
          email: email.trim(), 
          password: password.trim(),
          options: {
            emailRedirectTo: window.location.origin
          }
        });
        
        if (error) {
          if (error.message.includes('User already registered')) {
            throw new Error('Email này đã được đăng ký. Vui lòng đăng nhập.');
          }
          throw error;
        }

        if (data.user && data.session) {
          // If auto-logged in (email confirmation disabled)
          onSuccess();
        } else {
          setMessage('Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.');
          setMode('login');
          setPassword('');
          setConfirmPassword('');
        }
      } else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) throw error;
        setMessage('Liên kết khôi phục mật khẩu đã được gửi vào email của bạn.');
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      if (err.message === 'Invalid login credentials') {
        setError('Email hoặc mật khẩu không chính xác.');
      } else {
        setError(err.message || 'Đã có lỗi xảy ra. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
          <LogIn className="text-white" size={32} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">
          {mode === 'login' ? 'Đăng nhập hệ thống' : mode === 'signup' ? 'Đăng ký tài khoản' : 'Khôi phục mật khẩu'}
        </h2>
        <p className="text-gray-500 mt-2 text-sm">
          {mode === 'login' ? 'Chào mừng bạn quay trở lại' : mode === 'signup' ? 'Bắt đầu quản lý sơ đồ PLT của bạn' : 'Nhập email để nhận liên kết khôi phục'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="email"
              required
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>

        {mode !== 'reset' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  className={`w-full pl-10 pr-12 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${mode === 'signup' && password.length > 0 && !isPasswordValid ? 'border-red-300' : 'border-gray-200'}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {mode === 'signup' && password.length > 0 && !isPasswordValid && (
                <p className="text-[10px] text-red-500 mt-1 ml-1 font-medium italic">* Mật khẩu phải có ít nhất 6 ký tự</p>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    required
                    className={`w-full pl-10 pr-12 py-2.5 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all ${confirmPassword.length > 0 && !isPasswordMatch ? 'border-red-400 bg-red-50/30' : 'border-gray-200'}`}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && !isPasswordMatch && (
                  <p className="text-[10px] text-red-600 mt-1 ml-1 font-medium italic">* Mật khẩu xác nhận không khớp</p>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-xs rounded-lg border border-red-100 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-red-600" />
            {error}
          </div>
        )}

        {message && (
          <div className="p-3 bg-green-50 text-green-600 text-xs rounded-lg border border-green-100 flex items-center gap-2">
            <CheckCircle2 size={14} />
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <Loader2 className="animate-spin" size={20} />
          ) : (
            <>
              {mode === 'login' ? <LogIn size={20} /> : mode === 'signup' ? <UserPlus size={20} /> : <ArrowLeft size={20} />}
              {mode === 'login' ? 'Đăng nhập' : mode === 'signup' ? 'Đăng ký ngay' : 'Gửi liên kết'}
            </>
          )}
        </button>
      </form>

      <div className="mt-8 pt-6 border-t border-gray-50 flex flex-col gap-3">
        {mode === 'login' ? (
          <>
            <button 
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
                setMessage(null);
              }} 
              className="text-sm text-gray-600 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus size={16} /> Chưa có tài khoản? Đăng ký ngay
            </button>
            <button 
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
                setMessage(null);
              }} 
              className="text-sm text-gray-600 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <HelpCircle size={16} /> Quên mật khẩu?
            </button>
          </>
        ) : (
          <button 
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setMessage(null);
            }} 
            className="text-sm text-gray-600 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            <LogIn size={16} /> Quay lại đăng nhập
          </button>
        )}
      </div>
    </div>
  );
};

const CheckCircle2 = ({ size }: { size: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
  >
    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/>
  </svg>
);
