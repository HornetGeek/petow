import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface TermsScreenProps {
  onClose: () => void;
}

const TermsScreen: React.FC<TermsScreenProps> = ({ onClose }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Text style={styles.backButtonText}>← رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>الشروط والأحكام</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.updatedAt}>آخر تحديث: سبتمبر 2024</Text>

        <Text style={styles.paragraph}>
          باستخدامك لتطبيق PetMatch فإنك توافق على هذه الشروط والأحكام. يرجى قراءتها بعناية قبل إنشاء الحساب
          أو الاستمرار في استخدام خدماتنا.
        </Text>

        <Text style={styles.sectionTitle}>1. التسجيل والحساب</Text>
        <Text style={styles.paragraph}>
          يجب أن تكون المعلومات التي تقدمها دقيقة ومحدثة. أنت مسؤول عن حماية بيانات تسجيل الدخول الخاصة بك
          وعن أي نشاط يحدث من خلال حسابك. يحق لنا تعليق أو إغلاق الحسابات التي تنتهك هذه الشروط أو قوانين
          الاستخدام المعمول بها.
        </Text>

        <Text style={styles.sectionTitle}>2. استخدام الخدمة</Text>
        <Text style={styles.paragraph}>
          يوفر التطبيق منصة للتواصل بين مالكي الحيوانات الأليفة. يُحظر استخدام الخدمة لأي غرض مخالف للقانون،
          أو إرسال محتوى مسيء، أو انتحال شخصية الغير، أو الإضرار بالمستخدمين الآخرين. يحتفظ PetMatch بالحق في
          إزالة أي محتوى مخالف دون إشعار.
        </Text>

        <Text style={styles.sectionTitle}>3. المحتوى</Text>
        <Text style={styles.paragraph}>
          أنت تحتفظ بملكية المحتوى الذي تضيفه، لكنك تمنح PetMatch ترخيصًا غير حصري لاستخدامه وتشغيله ضمن نطاق
          التطبيق. أنت مسؤول عن التأكد من أن المحتوى لا ينتهك حقوق أي طرف ثالث.
        </Text>

        <Text style={styles.sectionTitle}>4. حدود المسؤولية</Text>
        <Text style={styles.paragraph}>
          يقدم PetMatch خدماته "كما هي" دون أي ضمانات صريحة أو ضمنية. لا نتحمل مسؤولية أي أضرار مباشرة أو غير مباشرة
          تنشأ عن استخدام التطبيق أو الاعتماد على أي معلومات مقدمة عبره. تعامل مع المستخدمين الآخرين بحذر واتخذ
          التدابير اللازمة لحماية نفسك وحيوانك الأليف.
        </Text>

        <Text style={styles.sectionTitle}>5. التعديلات والإنهاء</Text>
        <Text style={styles.paragraph}>
          يجوز لنا تعديل أو تحديث هذه الشروط في أي وقت. سيتم إخطارك بالتعديلات الجوهرية داخل التطبيق أو عبر البريد
          الإلكتروني. استمرار استخدامك للخدمة بعد التحديث يعني موافقتك على الشروط المعدلة. كما يحق لك أو لنا إنهاء
          استخدام الخدمة في أي وقت.
        </Text>

        <Text style={styles.sectionTitle}>6. القوانين المعمول بها</Text>
        <Text style={styles.paragraph}>
          تخضع هذه الشروط وتُفسر وفق القوانين المعمول بها في جمهورية مصر العربية، مع مراعاة الاختصاص القضائي للمحاكم
          المحلية في حالة النزاعات.
        </Text>

        <Text style={styles.sectionTitle}>7. تواصل معنا</Text>
        <Text style={styles.paragraph}>
          لأي أسئلة أو ملاحظات حول هذه الشروط، يرجى التواصل مع فريق PetMatch على support@petow.app.
        </Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#02B7B4',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  updatedAt: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 16,
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'right',
  },
  paragraph: {
    fontSize: 15,
    color: '#34495e',
    lineHeight: 24,
    textAlign: 'right',
  },
});

export default TermsScreen;
