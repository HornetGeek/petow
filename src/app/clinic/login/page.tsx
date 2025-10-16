"use client";

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

import LoadingSpinner from '@/components/LoadingSpinner';
import ClinicAuthLayout from '@/features/clinic-dashboard/components/ClinicAuthLayout';
import { useClinicAuth } from '@/features/clinic-dashboard/context/ClinicAuthContext';

export default function ClinicLoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading, signIn } = useClinicAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo = params?.get('redirect') || '/clinic/dashboard';

  useEffect(() => {
    if (!loading && session) {
      router.replace(redirectTo);
    }
  }, [loading, session, router, redirectTo]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await signIn(trimmedEmail, password);
      router.replace(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الدخول، حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || (session && !submitting)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <ClinicAuthLayout
      title="تسجيل دخول العيادة"
      subtitle="ادخل بيانات اعتماد العيادة للوصول إلى لوحة التحكم."
      size="sm"
      footer={(
        <>
          لا تمتلك حساباً كعيادة؟{' '}
          <Link
            href={`/clinic/register?redirect=${encodeURIComponent(redirectTo)}`}
            className="font-semibold text-[var(--primary)] hover:text-[var(--primary-dark)]"
          >
            إنشاء حساب جديد
          </Link>
        </>
      )}
    >
      <div className="mb-2 flex justify-center">
        <img src="/petmatchlogo.jpeg" alt="Petow" className="h-10" />
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2 text-right">
          <label className="text-sm font-semibold text-[var(--gray-700)]" htmlFor="clinic-email">
            البريد الإلكتروني
          </label>
          <input
            id="clinic-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border border-[var(--gray-200)] bg-[var(--gray-50)] px-4 py-3 text-right text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-light)]"
            placeholder="clinic@petow.app"
            dir="ltr"
          />
        </div>

        <div className="space-y-2 text-right">
          <label className="text-sm font-semibold text-[var(--gray-700)]" htmlFor="clinic-password">
            كلمة المرور
          </label>
          <input
            id="clinic-password"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-xl border border-[var(--gray-200)] bg-[var(--gray-50)] px-4 py-3 text-right text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-light)]"
            placeholder="••••••••"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-[var(--error-light)] bg-[var(--error-light)]/15 px-4 py-3 text-sm text-[var(--error-dark)]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:opacity-75"
        >
          {submitting ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
        </button>
      </form>
    </ClinicAuthLayout>
  );
}
