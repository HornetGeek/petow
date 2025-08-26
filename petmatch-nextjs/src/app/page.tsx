'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import { apiService, Pet } from '@/lib/api';

export default function Home() {
  const [popularPets, setPopularPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPopularPets();
  }, []);

  const loadPopularPets = async () => {
    try {
      const response = await apiService.getPets({ ordering: '-created_at' });
      // أخذ أول 3 حيوانات كحيوانات شعبية
      setPopularPets(response.results.slice(0, 3));
    } catch (error) {
      console.error('Error loading popular pets:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Header />

      {/* Main Content */}
      <div className="container">
        {/* Hero Section */}
        <section className="hero fade-in" id="home">
          <div className="left">
            <div className="subtitle">
              <i className="fas fa-paw"></i>
              منصة التزاوج الآمن للحيوانات الأليفة
            </div>
            <h1>وصل حيوانك بالشريك المناسب -- أمان وثقة</h1>
            <p>
              مع Peto، نجعل عملية البحث عن شريك مناسب لحيوانك الأليف أمراً سهلاً وآمناً. 
              نوفر منصة موثوقة تضمن التوثيق البيطري الكامل والمطابقة المثالية بناءً على السلالة والصحة والمزاج.
            </p>
            <div className="actions">
              <Link href="/pets" className="btn-primary">
                <i className="fas fa-search"></i>
                ابحث عن شريك
              </Link>
              <Link href="/add-pet" className="btn-outline">
                <i className="fas fa-plus"></i>
                أضف حيوانك الأليف
              </Link>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="number">5000+</span>
                <span className="label">حيوان مسجل</span>
              </div>
              <div className="stat">
                <span className="number">1200+</span>
                <span className="label">مطابقة ناجحة</span>
              </div>
              <div className="stat">
                <span className="number">98%</span>
                <span className="label">رضا العملاء</span>
              </div>
            </div>
          </div>
          <div className="hero-image float"></div>
        </section>

        {/* Search Bar */}
        <div className="search-bar fade-in">
          <input type="text" placeholder="ابحث بالسلالة أو النوع..." className="search-input" />
          <select>
            <option>نوع الحيوان</option>
            <option>قطط</option>
            <option>كلاب</option>
            <option>طيور</option>
            <option>أرانب</option>
          </select>
          <select>
            <option>المنطقة</option>
            <option>الرياض</option>
            <option>جدة</option>
            <option>الدمام</option>
            <option>مكة</option>
          </select>
          <Link href="/pets" className="search-btn">
            <i className="fas fa-search"></i>
            ابحث
          </Link>
        </div>

        {/* Stats Section */}
        <section className="stats-section fade-in">
          <div className="stats-grid">
            <div className="stat-item">
              <i className="fas fa-paw icon"></i>
              <div className="number">5,247</div>
              <div className="label">حيوان مسجل</div>
            </div>
            <div className="stat-item">
              <i className="fas fa-heart icon"></i>
              <div className="number">1,863</div>
              <div className="label">مطابقة ناجحة</div>
            </div>
            <div className="stat-item">
              <i className="fas fa-user-md icon"></i>
              <div className="number">150+</div>
              <div className="label">طبيب بيطري</div>
            </div>
            <div className="stat-item">
              <i className="fas fa-shield-alt icon"></i>
              <div className="number">100%</div>
              <div className="label">ضمان الأمان</div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="section fade-in" id="features">
          <h2 className="center">لماذا تختار Peto؟</h2>
          <div className="features-grid">
            <div className="feature-card">
              <i className="fas fa-certificate icon"></i>
              <h3>توثيق بيطري شامل</h3>
              <p>جميع الحيوانات المسجلة تحمل شهادات صحية معتمدة من أطباء بيطريين مؤهلين لضمان سلامة العملية.</p>
            </div>
            <div className="feature-card">
              <i className="fas fa-dna icon"></i>
              <h3>مطابقة ذكية</h3>
              <p>خوارزمية متقدمة تحلل السلالة والمزاج والصحة لإيجاد أفضل مطابقة ممكنة لحيوانك الأليف.</p>
            </div>
            <div className="feature-card">
              <i className="fas fa-map-marker-alt icon"></i>
              <h3>بحث محلي</h3>
              <p>ابحث عن شركاء في منطقتك أو المناطق المجاورة بسهولة مع خدمة تحديد المواقع الدقيقة.</p>
            </div>
            <div className="feature-card">
              <i className="fas fa-comments icon"></i>
              <h3>دعم مباشر</h3>
              <p>فريق خبراء متاح على مدار الساعة لتقديم الاستشارات والدعم في كل خطوة من العملية.</p>
            </div>
            <div className="feature-card">
              <i className="fas fa-camera icon"></i>
              <h3>معرض صور عالي الجودة</h3>
              <p>اعرض حيوانك الأليف بأفضل صورة مع معرض صور متقدم يدعم الصور عالية الدقة والفيديوهات.</p>
            </div>
            <div className="feature-card">
              <i className="fas fa-star icon"></i>
              <h3>تقييمات موثوقة</h3>
              <p>نظام تقييم شفاف من المجتمع يساعدك على اتخاذ قرارات مدروسة بناءً على تجارب حقيقية.</p>
            </div>
          </div>
        </section>



        {/* How It Works */}
        <section className="section how-it-works-section fade-in" id="how-it-works">
          <div className="section-header">
            <h2 className="center">كيف يعمل Peto؟</h2>
            <p className="center section-subtitle">رحلة بسيطة ومأمونة نحو إيجاد الشريك المثالي لحيوانك الأليف</p>
          </div>
          
          <div className="process-timeline">
            <div className="process-step slide-in-left" style={{animationDelay: '0.2s'}}>
              <div className="step-icon-wrapper">
                <div className="step-number">1</div>
                <div className="step-icon">
                  <i className="fas fa-user-plus"></i>
                </div>
              </div>
              <div className="step-content">
                <h4>إنشاء ملف شخصي</h4>
                <p>أنشئ ملفاً شخصياً مفصلاً لحيوانك الأليف مع الصور والمعلومات الصحية والسلوكية الشاملة.</p>
                <div className="step-features">
                  <span className="feature-tag">
                    <i className="fas fa-camera"></i>
                    رفع صور عالية الجودة
                  </span>
                  <span className="feature-tag">
                    <i className="fas fa-file-medical"></i>
                    شهادة طبية
                  </span>
                </div>
              </div>
            </div>

            <div className="process-step slide-in-right" style={{animationDelay: '0.4s'}}>
              <div className="step-icon-wrapper">
                <div className="step-number">2</div>
                <div className="step-icon">
                  <i className="fas fa-search"></i>
                </div>
              </div>
              <div className="step-content">
                <h4>البحث والاكتشاف</h4>
                <p>استخدم الفلاتر المتقدمة للبحث عن شركاء مناسبين في منطقتك أو المناطق المجاورة بدقة عالية.</p>
                <div className="step-features">
                  <span className="feature-tag">
                    <i className="fas fa-filter"></i>
                    فلاتر ذكية
                  </span>
                  <span className="feature-tag">
                    <i className="fas fa-map-marker-alt"></i>
                    بحث محلي
                  </span>
                </div>
              </div>
            </div>

            <div className="process-step slide-in-left" style={{animationDelay: '0.6s'}}>
              <div className="step-icon-wrapper">
                <div className="step-number">3</div>
                <div className="step-icon">
                  <i className="fas fa-handshake"></i>
                </div>
              </div>
              <div className="step-content">
                <h4>طلب المقابلة</h4>
                <p>أرسل طلب مقابلة مع تحديد الوقت والمكان وطبيب بيطري مؤهل لضمان سلامة العملية.</p>
                <div className="step-features">
                  <span className="feature-tag">
                    <i className="fas fa-calendar"></i>
                    جدولة مرنة
                  </span>
                  <span className="feature-tag">
                    <i className="fas fa-stethoscope"></i>
                    إشراف بيطري
                  </span>
                </div>
              </div>
            </div>

            <div className="process-step slide-in-right" style={{animationDelay: '0.8s'}}>
              <div className="step-icon-wrapper">
                <div className="step-number">4</div>
                <div className="step-icon">
                  <i className="fas fa-heart"></i>
                </div>
              </div>
              <div className="step-content">
                <h4>اللقاء الآمن</h4>
                <p>التقي بالمالك الآخر في بيئة آمنة ومناسبة مع دعم فني متكامل طوال العملية.</p>
                <div className="step-features">
                  <span className="feature-tag">
                    <i className="fas fa-shield-alt"></i>
                    بيئة آمنة
                  </span>
                  <span className="feature-tag">
                    <i className="fas fa-headset"></i>
                    دعم فني
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="process-benefits">
            <div className="benefit-item">
              <i className="fas fa-clock"></i>
              <h5>سريع وسهل</h5>
              <p>عملية بسيطة تستغرق دقائق معدودة</p>
            </div>
            <div className="benefit-item">
              <i className="fas fa-lock"></i>
              <h5>آمن ومضمون</h5>
              <p>حماية كاملة لبياناتك ومعلوماتك</p>
            </div>
            <div className="benefit-item">
              <i className="fas fa-money-bill-slash"></i>
              <h5>مجاني تماماً</h5>
              <p>لا توجد رسوم خفية أو اشتراكات</p>
            </div>
          </div>

          <div className="section-footer">
            <Link href="/add-pet" className="btn btn-primary btn-large">
              <i className="fas fa-plus"></i>
              ابدأ الآن مجاناً
            </Link>
            <Link href="/pets" className="btn btn-outline btn-large">
              <i className="fas fa-search"></i>
              تصفح الحيوانات
            </Link>
          </div>
        </section>



        {/* CTA Section */}
        <section className="cta-section fade-in">
          <div className="cta-content">
            <h2>ابدأ رحلتك اليوم</h2>
            <p>انضم إلى آلاف المربيين الذين وثقوا بـ Peto لإيجاد الشريك المثالي لحيواناتهم الأليفة</p>
            <Link href="/add-pet" className="btn-white">
              <i className="fas fa-rocket"></i>
              إنشاء حساب مجاني
            </Link>
          </div>
        </section>

        {/* Popular Pets */}
        <section className="section fade-in">
          <h2 className="center">الحيوانات الأكثر شعبية</h2>
          {loading ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>جاري تحميل الحيوانات...</p>
            </div>
          ) : popularPets.length > 0 ? (
            <div className="grid">
              {popularPets.map((pet) => (
                <div key={pet.id} className="card">
                  <div className="img" style={{backgroundImage: `url('${pet.main_image || '/placeholder-pet.jpg'}')`}}>
                    <div className="badge">{pet.pet_type_display}</div>
                    {pet.is_fertile && (
                      <div className="fertile-indicator">
                        <i className="fas fa-heart"></i>
                        جاهز للتزاوج
                      </div>
                    )}
                    {(pet.vaccination_certificate || pet.health_certificate || pet.has_health_certificates) && (
                      <div className="certified-indicator">
                        <i className="fas fa-certificate"></i>
                        موثق طبياً
                      </div>
                    )}
                  </div>
                  <div className="body">
                    <div className="meta">
                      <span>{pet.location || 'غير محدد'}</span>
                      <span>{pet.gender_display}</span>
                    </div>
                    <div className="title">{pet.name}{pet.breed_name ? ` - ${pet.breed_name}` : ''}</div>
                    <p className="muted">{pet.description ? pet.description.slice(0, 100) + '...' : 'حيوان أليف جميل يبحث عن شريك مناسب.'}</p>
                    <div className="actions-row">
                      <Link href={`/pets/${pet.id}`} className="btn-secondary">عرض التفاصيل</Link>
                      <Link href={`/breeding-request/${pet.id}`} className="btn-secondary">طلب تزاوج</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <i className="fas fa-paw"></i>
              <p>لا توجد حيوانات متاحة حالياً</p>
              <Link href="/add-pet" className="btn btn-primary">
                <i className="fas fa-plus"></i>
                أضف حيوانك الأليف
              </Link>
            </div>
          )}
        </section>

        {/* Testimonials */}
        <section className="section fade-in">
          <h2 className="center">ماذا يقول عملاؤنا</h2>
          <div className="testi">
            <div className="item">
              <strong>سارة أحمد - مربية قطط</strong>
              <p className="muted">
                &ldquo;تجربة رائعة! وجدت الشريك المثالي لقطتي مونا خلال أسبوع واحد فقط. 
                الخدمة احترافية والدعم ممتاز. أنصح الجميع بتجربة Peto.&rdquo;
              </p>
            </div>
            <div className="item">
              <strong>محمد الخالدي - مربي كلاب</strong>
              <p className="muted">
                &ldquo;منصة موثوقة وآمنة جداً. التحقق البيطري يعطي راحة بال كبيرة. 
                تمكنت من توسيع مزرعتي بثقة تامة بفضل Peto.&rdquo;
              </p>
            </div>
            <div className="item">
              <strong>فاطمة العلي - محبة الحيوانات</strong>
              <p className="muted">
                &ldquo;كانت تجربة ممتعة ومثمرة. التطبيق سهل الاستخدام والبحث دقيق جداً. 
                حيواني الأليف سعيد وأنا سعيدة أيضاً!&rdquo;
              </p>
            </div>
            <div className="item">
              <strong>أحمد السعدي - طبيب بيطري</strong>
              <p className="muted">
                &ldquo;كطبيب بيطري، أقدر المعايير العالية للصحة والسلامة في هذه المنصة. 
                التوثيق دقيق والفحوصات شاملة.&rdquo;
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="section fade-in">
          <h2 className="center">الأسئلة الشائعة</h2>
          <div className="faq">
            <details>
              <summary>كيف يمكنني التأكد من صحة الحيوانات؟</summary>
              <p>جميع الحيوانات المسجلة في المنصة تخضع للفحص البيطري الإلزامي ويجب تقديم شهادات صحية معتمدة. كما نتحقق من جميع الوثائق قبل الموافقة على التسجيل.</p>
            </details>
            <details>
              <summary>هل هناك ضمان لنجاح عملية التزاوج؟</summary>
              <p>نحن نوفر أفضل الظروف للمطابقة الناجحة، لكن النتائج تعتمد على عوامل طبيعية متعددة. نقدم استشارات بيطرية مجانية لزيادة فرص النجاح.</p>
            </details>
            <details>
              <summary>كم تستغرق عملية البحث عن شريك مناسب؟</summary>
              <p>عادة ما تستغرق من أسبوع إلى شهر واحد حسب نوع الحيوان والمنطقة الجغرافية ومعايير البحث المحددة.</p>
            </details>
            <details>
              <summary>هل يمكنني إلغاء الاشتراك في أي وقت؟</summary>
              <p>بالطبع! يمكنك إلغاء اشتراكك في أي وقت دون أي رسوم إضافية. ستحتفظ بالوصول للخدمات حتى نهاية الفترة المدفوعة.</p>
            </details>
            <details>
              <summary>هل تقدمون خدمات في جميع أنحاء المملكة؟</summary>
              <p>نعم، نغطي جميع المدن والمحافظات في المملكة العربية السعودية مع شبكة من الأطباء البيطريين المعتمدين.</p>
            </details>
          </div>
        </section>


      </div>

      {/* Footer */}
      <footer>
        <div className="container">
          <div className="cols">
            <div>
              <h4>Peto – Care. Match. Love.</h4>
              <p>منصة الربط الآمن للحيوانات الأليفة. نربط القلوب ونخلق عائلات سعيدة.</p>
              <div className="social-links">
                <a href="#"><i className="fab fa-facebook"></i></a>
                <a href="#"><i className="fab fa-twitter"></i></a>
                <a href="#"><i className="fab fa-instagram"></i></a>
                <a href="#"><i className="fab fa-linkedin"></i></a>
              </div>
            </div>
            <div>
              <h4>روابط سريعة</h4>
              <p><a href="#home">الرئيسية</a></p>
              <p><a href="#features">المميزات</a></p>
              <p><Link href="/pets">الحيوانات</Link></p>
              <p><a href="#contact">تواصل معنا</a></p>
            </div>
            <div>
              <h4>الدعم</h4>
              <p><a href="#">مركز المساعدة</a></p>
              <p><a href="#">الأسئلة الشائعة</a></p>
              <p><a href="#">سياسة الخصوصية</a></p>
              <p><a href="#">شروط الاستخدام</a></p>
            </div>
            <div>
              <h4>تواصل معنا</h4>
              <p><i className="fas fa-phone"></i> +966 50 123 4567</p>
              <p><i className="fas fa-envelope"></i> info@peto.sa</p>
              <p><i className="fas fa-map-marker-alt"></i> الرياض، المملكة العربية السعودية</p>
            </div>
          </div>
          <div style={{textAlign: 'center', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid var(--gray-300)'}}>
            <p>&copy; 2024 Peto. جميع الحقوق محفوظة.</p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .section-header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .section-subtitle {
          font-size: 1.2rem;
          color: var(--muted);
          margin-top: 1rem;
          max-width: 600px;
          margin-left: auto;
          margin-right: auto;
          line-height: 1.6;
        }

        /* How It Works Section */
        .how-it-works-section {
          background: white;
          border-radius: 2rem;
          padding: 3rem 2rem;
          margin: 2rem 0;
          border: 1px solid rgba(0, 0, 0, 0.05);
        }

        .process-timeline {
          position: relative;
          margin: 3rem 0;
        }

        .process-timeline::before {
          content: '';
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 3px;
          background: linear-gradient(to bottom, var(--primary) 0%, var(--secondary) 100%);
          transform: translateX(-50%);
          z-index: 1;
        }

        @media (max-width: 768px) {
          .process-timeline::before {
            left: 30px;
          }
        }

        .process-step {
          display: flex;
          align-items: center;
          margin-bottom: 4rem;
          position: relative;
          z-index: 2;
        }

        .process-step:nth-child(even) {
          flex-direction: row-reverse;
        }

        @media (max-width: 768px) {
          .process-step,
          .process-step:nth-child(even) {
            flex-direction: row;
            padding-left: 80px;
          }
        }

        .step-icon-wrapper {
          position: relative;
          margin: 0 2rem;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .step-icon-wrapper {
            position: absolute;
            left: 0;
            margin: 0;
          }
        }

        .step-number {
          position: absolute;
          top: -10px;
          right: -10px;
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
          font-weight: 700;
          z-index: 3;
          box-shadow: 0 4px 12px rgba(2, 183, 180, 0.3);
        }

        .step-icon {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border: 3px solid white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          color: var(--primary);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }

        .process-step:hover .step-icon {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          transform: scale(1.1);
        }

        .step-content {
          flex: 1;
          background: white;
          padding: 2rem;
          border-radius: 20px;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.08);
          border: 1px solid rgba(0, 0, 0, 0.05);
          max-width: 400px;
        }

        @media (max-width: 768px) {
          .step-content {
            max-width: none;
          }
        }

        .step-content h4 {
          font-size: 1.4rem;
          font-weight: 700;
          color: var(--dark);
          margin-bottom: 1rem;
        }

        .step-content p {
          color: var(--muted);
          line-height: 1.6;
          margin-bottom: 1.5rem;
        }

        .step-features {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .feature-tag {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: var(--gray-100);
          color: var(--dark);
          padding: 0.4rem 0.8rem;
          border-radius: 12px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .feature-tag i {
          color: var(--primary);
          font-size: 0.9rem;
        }

        .process-benefits {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 2rem;
          margin: 3rem 0;
          padding: 2rem;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-radius: 20px;
        }

        .benefit-item {
          text-align: center;
          padding: 1.5rem;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
          transition: transform 0.3s ease;
        }

        .benefit-item:hover {
          transform: translateY(-5px);
        }

        .benefit-item i {
          font-size: 2.5rem;
          color: var(--primary);
          margin-bottom: 1rem;
        }

        .benefit-item h5 {
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--dark);
          margin-bottom: 0.5rem;
        }

        .benefit-item p {
          color: var(--muted);
          font-size: 0.9rem;
        }

        /* Enhanced Buttons */
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          border-radius: 16px;
          font-size: 1rem;
          font-weight: 600;
          text-decoration: none;
          cursor: pointer;
          transition: all 0.3s ease;
          border: 2px solid transparent;
          font-family: "Cairo", sans-serif;
        }

        .btn-large {
          padding: 1.25rem 2.5rem;
          font-size: 1.1rem;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          box-shadow: 0 8px 25px rgba(2, 183, 180, 0.3);
        }

        .btn-primary:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(2, 183, 180, 0.4);
        }

        .btn-outline {
          background: transparent;
          color: var(--dark);
          border-color: var(--gray-300);
        }

        .btn-outline:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          transform: translateY(-3px);
          box-shadow: 0 8px 25px rgba(2, 183, 180, 0.3);
        }

        .section-footer {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
          text-align: center;
        }

        /* CTA Section */
        .cta-section {
          background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
          color: white;
          padding: 4rem 2rem;
          margin: 3rem 0;
          border-radius: 2rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }

        .cta-section::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="40" r="1.5" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="80" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
          opacity: 0.3;
        }

        .cta-content {
          position: relative;
          z-index: 2;
          max-width: 600px;
          margin: 0 auto;
        }

        .cta-content h2 {
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 1.5rem;
          color: white;
        }

        .cta-content p {
          font-size: 1.2rem;
          line-height: 1.8;
          margin-bottom: 2.5rem;
          opacity: 0.95;
        }

        .btn-white {
          background: white;
          color: var(--primary);
          padding: 1.25rem 2.5rem;
          border-radius: 16px;
          font-size: 1.1rem;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          transition: all 0.3s ease;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        }

        .btn-white:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.3);
          color: var(--secondary);
        }

        @media (max-width: 768px) {
          .cta-content h2 {
            font-size: 2rem;
          }
          
          .cta-content p {
            font-size: 1.1rem;
          }
        }

        /* Loading and Empty States */
        .loading-state {
          text-align: center;
          padding: 3rem 1rem;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid var(--gray-200);
          border-top: 4px solid var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 1rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .empty-state {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--muted);
        }

        .empty-state i {
          font-size: 3rem;
          color: var(--primary);
          margin-bottom: 1rem;
        }

        .empty-state p {
          font-size: 1.1rem;
          margin-bottom: 2rem;
        }

        /* Fertile Indicator */
        .fertile-indicator {
          position: absolute;
          bottom: 1rem;
          left: 1rem;
          background: rgba(236, 72, 153, 0.9);
          color: white;
          padding: 0.4rem 0.8rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          backdrop-filter: blur(10px);
        }

        .fertile-indicator i {
          font-size: 0.8rem;
        }

        /* Certified Indicator */
        .certified-indicator {
          position: absolute;
          bottom: 1rem;
          right: 1rem;
          background: rgba(59, 130, 246, 0.9);
          color: white;
          padding: 0.4rem 0.8rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 0.3rem;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .certified-indicator i {
          font-size: 0.8rem;
        }

        @media (max-width: 480px) {
          .section-footer {
            flex-direction: column;
            align-items: center;
          }
          
          .btn {
            width: 100%;
            max-width: 300px;
          }

          .featured-pets-grid {
            grid-template-columns: 1fr;
          }

          .pet-details {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
