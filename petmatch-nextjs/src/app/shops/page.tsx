'use client';
import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { apiService, VeterinaryClinic } from '@/lib/api';
import Link from 'next/link';
import Image from 'next/image';

// تم تعطيل صفحة المتاجر مؤقتاً
export default function ShopsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-light)' }}>
      <ProtectedRoute>
      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '3rem 2rem',
          boxShadow: '0 10px 30px rgba(0,0,0,0.1)'
        }}>
          <i className="fas fa-store" style={{
            fontSize: '4rem',
            color: 'var(--muted)',
            marginBottom: '2rem',
            opacity: 0.5
          }}></i>
          <h1 style={{ 
            fontSize: '2rem', 
            color: 'var(--text)', 
            marginBottom: '1rem' 
          }}>
            صفحة المتاجر
          </h1>
          <p style={{ 
            color: 'var(--text-light)', 
            fontSize: '1.1rem',
            marginBottom: '2rem',
            lineHeight: '1.6'
          }}>
            هذه الصفحة معطلة مؤقتاً. سنقوم بإعادة تفعيلها قريباً مع مزايا جديدة ومحسنة.
          </p>
          <Link href="/" style={{
            background: 'var(--primary)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: '10px',
            textDecoration: 'none',
            fontWeight: '600',
            display: 'inline-block',
            transition: 'all 0.3s ease'
          }}>
            العودة للصفحة الرئيسية
          </Link>
        </div>
      </div>
      </ProtectedRoute>
    </div>
  );
}

/*
// الكود الأصلي معطل مؤقتاً
interface Shop {
  id: number;
  name: string;
  description: string;
  location: string;
  rating: number;
  image: string;
  specialties: string[];
  contact: {
    phone: string;
    email: string;
    website?: string;
  };
}

const SHOPS: Shop[] = [
  {
    id: 1,
    name: "مستشفى الحيوانات الأليفة",
    description: "مستشفى بيطري متخصص في رعاية الحيوانات الأليفة مع أحدث التقنيات الطبية.",
    location: "الرياض، شارع الملك فهد",
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1576201836106-db1758fd1c97?auto=format&fit=crop&w=400&q=80",
    specialties: ["جراحة", "طب داخلي", "أسنان", "تطعيمات"],
    contact: {
      phone: "+966 50 123 4567",
      email: "info@vetclinic.sa",
      website: "www.vetclinic.sa"
    }
  }
];

export default function ShopsPage() {
  return (
    <div>صفحة المتاجر معطلة</div>
  );
}
*/ 