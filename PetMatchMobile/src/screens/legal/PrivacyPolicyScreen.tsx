import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

interface PrivacyPolicyScreenProps {
  onClose: () => void;
}

const PrivacyPolicyScreen: React.FC<PrivacyPolicyScreenProps> = ({ onClose }) => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backButton}>
          <Text style={styles.backButtonText}>← رجوع</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>سياسة الخصوصية</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.updatedAt}>آخر تحديث: سبتمبر 2024</Text>

        <Text style={styles.paragraph}>
          نحترم خصوصيتك ونلتزم بحماية بياناتك الشخصية أثناء استخدامك لتطبيق PetMatch. توضح هذه السياسة
          كيفية جمعنا للمعلومات واستخدامها ومشاركتها وحفظها، بالإضافة إلى الخيارات والحقوق المتاحة لك.
        </Text>

        <Text style={styles.sectionTitle}>1. البيانات التي نجمعها</Text>
        <Text style={styles.paragraph}>
          • بيانات الحساب: الاسم، البريد الإلكتروني، كلمة المرور، وصورة الملف الشخصي إن وُجدت.

          • معلومات الحيوانات الأليفة: الاسم، السلالة، العمر، الحالة الصحية، وأي تفاصيل أخرى تضيفها.

          • بيانات الاستخدام: تفاعلك مع التطبيق، الأجهزة، والإشعارات.

          • بيانات اختيارية: رقم الهاتف أو الموقع في حالة اختيارك تفعيل هذه الميزات.
        </Text>

        <Text style={styles.sectionTitle}>2. كيفية استخدام البيانات</Text>
        <Text style={styles.paragraph}>
          نستخدم بياناتك من أجل: إنشاء الحساب وإدارته، تقديم خدمات مطابقة الحيوانات الأليفة، تحسين الأداء
          والتجربة، إرسال إشعارات متعلقة بالنشاط داخل التطبيق، والرد على استفسارات الدعم.
        </Text>

        <Text style={styles.sectionTitle}>3. مشاركة البيانات</Text>
        <Text style={styles.paragraph}>
          لا نبيع بياناتك الشخصية. قد نشارك معلومات محدودة مع مزودي خدمة موثوقين يساعدوننا في تشغيل التطبيق
          (مثل خدمات الاستضافة والتحليلات) مع التزامهم التعاقدي بحماية البيانات. سنلتزم بأي التزامات قانونية
          بالتصريح عن البيانات إذا طُلب منا ذلك بموجب القانون.
        </Text>

        <Text style={styles.sectionTitle}>4. الاحتفاظ بالبيانات</Text>
        <Text style={styles.paragraph}>
          نحتفظ ببيانات حسابك طالما كان حسابك نشطًا. في حال طلب حذف الحساب أو إغلاقه نقوم بإزالة أو إخفاء
          البيانات الشخصية خلال مدة زمنية معقولة ما لم يتطلب القانون الاحتفاظ بها لفترة أطول.
        </Text>

        <Text style={styles.sectionTitle}>5. حقوقك</Text>
        <Text style={styles.paragraph}>
          يمكنك تحديث معلوماتك، طلب نسخة من بياناتك، أو حذف حسابك من داخل التطبيق. لمزيد من الطلبات المتعلقة
          بالخصوصية يرجى التواصل معنا عبر البريد الإلكتروني support@petow.app.
        </Text>

        <Text style={styles.sectionTitle}>6. الأمان</Text>
        <Text style={styles.paragraph}>
          نستخدم تدابير تقنية وإدارية مناسبة لحماية بياناتك، ومع ذلك فإن أي نقل عبر الإنترنت لا يمكن أن يكون
          آمنًا بنسبة 100٪. سنقوم بإخطارك بأي خرق أمني يؤثر على خصوصيتك وفق المتطلبات القانونية.
        </Text>

        <Text style={styles.sectionTitle}>7. التحديثات</Text>
        <Text style={styles.paragraph}>
          قد نقوم بتحديث سياسة الخصوصية من وقت لآخر. سنُخطرك داخل التطبيق أو عبر البريد الإلكتروني عند إجراء
          أي تغييرات جوهرية، وسيصبح الاستمرار في استخدام التطبيق عقب التحديث موافقة ضمنية على السياسة المعدلة.
        </Text>

        <Text style={styles.sectionTitle}>8. تواصل معنا</Text>
        <Text style={styles.paragraph}>
          لأي أسئلة حول سياسة الخصوصية، تواصل مع فريق PetMatch على support@petow.app.
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

export default PrivacyPolicyScreen;
