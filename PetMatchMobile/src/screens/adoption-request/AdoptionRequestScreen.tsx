import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Alert,
  Modal,
  Platform,
  LayoutChangeEvent,
} from 'react-native';
import { apiService, Pet } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import MapLocationPicker from '../../components/MapLocationPicker';
import { normalizeLatLng } from '../../utils/coordinates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import AppIcon from '../../components/icons/AppIcon';

interface AdoptionRequestScreenProps {
  petId: number;
  onClose: () => void;
  onSuccess?: () => void;
  onRequireVerification?: (message?: string) => void;
}

const AdoptionRequestScreen: React.FC<AdoptionRequestScreenProps> = ({
  petId,
  onClose,
  onSuccess,
  onRequireVerification,
}) => {
  const insets = useSafeAreaInsets();
  const bottomSafeSpace = Math.max(120, insets.bottom + 96);
  const { user } = useAuth();
  const initialUserLocation = normalizeLatLng(user?.latitude, user?.longitude);
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  const [formData, setFormData] = useState(() => ({
    adopter_name: user?.full_name || '',
    adopter_email: user?.email || '',
    adopter_phone: user?.phone || '',
    adopter_age: '',
    adopter_occupation: '',
    adopter_address: user?.address || '',
    adopter_latitude: initialUserLocation?.lat ?? null,
    adopter_longitude: initialUserLocation?.lng ?? null,
    housing_type: 'apartment',
    family_members: '1',
    experience_level: 'basic',
    time_availability: 'high',
    reason_for_adoption: '',
    family_agreement: false,
    agrees_to_follow_up: false,
    agrees_to_vet_care: false,
    agrees_to_training: false,
    feeding_plan: '',
    exercise_plan: '',
    vet_care_plan: '',
    emergency_plan: '',
  }));

  const scrollViewRef = useRef<ScrollView | null>(null);
  const sectionPositions = useRef<Record<string, number>>({});

  const onSectionLayout = (key: string) => (event: LayoutChangeEvent) => {
    sectionPositions.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = (key: string) => {
    const y = sectionPositions.current[key];
    if (y !== undefined && scrollViewRef.current) {
      scrollViewRef.current.scrollTo({ y: Math.max(y - 40, 0), animated: true });
    }
  };

  useEffect(() => {
    loadPet();
  }, [petId]);

  useEffect(() => {
    if (__DEV__ && (user?.latitude != null || user?.longitude != null) && !initialUserLocation) {
      console.warn('AdoptionRequestScreen: invalid initial user coordinates ignored', {
        latitude: user?.latitude,
        longitude: user?.longitude,
      });
    }
  }, [initialUserLocation, user?.latitude, user?.longitude]);

  const normalizedAdopterLocation = useMemo(
    () => normalizeLatLng(formData.adopter_latitude, formData.adopter_longitude),
    [formData.adopter_latitude, formData.adopter_longitude],
  );

  const loadPet = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPet(petId);
      if (response.success && response.data) {
        setPet(response.data);
      } else {
        Alert.alert('خطأ', 'لم نتمكن من تحميل بيانات الحيوان');
        onClose();
      }
    } catch (error) {
      console.error('Error loading pet:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحميل البيانات');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const validatePhone = (phone: string) => {
    const cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
    const egyptianRegex = /^(20[0-9]{10,11}|01[0-9]{9})$/;
    const saudiRegex = /^(966[0-9]{9}|05[0-9]{8})$/;
    const uaeRegex = /^(971[0-9]{9}|05[0-9]{8})$/;
    return egyptianRegex.test(cleanPhone) || saudiRegex.test(cleanPhone) || uaeRegex.test(cleanPhone);
  };

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.adopter_name.trim()) {
      newErrors.adopter_name = 'الاسم الكامل مطلوب';
    }

    if (!formData.adopter_email.trim()) {
      newErrors.adopter_email = 'البريد الإلكتروني مطلوب';
    } else if (!validateEmail(formData.adopter_email)) {
      newErrors.adopter_email = 'البريد الإلكتروني غير صحيح';
    }

    if (!formData.adopter_phone.trim()) {
      newErrors.adopter_phone = 'رقم الهاتف مطلوب';
    } else if (!validatePhone(formData.adopter_phone)) {
      newErrors.adopter_phone = 'رقم الهاتف غير صحيح';
    }

    const age = parseInt(formData.adopter_age);
    if (!formData.adopter_age || isNaN(age)) {
      newErrors.adopter_age = 'العمر مطلوب';
    } else if (age < 18) {
      newErrors.adopter_age = 'يجب أن يكون عمرك 18 سنة على الأقل';
    } else if (age > 120) {
      newErrors.adopter_age = 'الرجاء إدخال عمر صحيح';
    }

    if (!formData.adopter_occupation.trim()) {
      newErrors.adopter_occupation = 'المهنة مطلوبة';
    }

    if (!formData.adopter_address.trim()) {
      newErrors.adopter_address = 'العنوان مطلوب';
    }

    if (!normalizedAdopterLocation) {
      newErrors.adopter_address = 'يرجى تحديد الموقع على الخريطة';
    }

    if (!formData.reason_for_adoption.trim()) {
      newErrors.reason_for_adoption = 'يرجى ذكر سبب رغبتك في التبني';
    } else if (formData.reason_for_adoption.trim().length < 20) {
      newErrors.reason_for_adoption = 'يرجى كتابة سبب مفصل (20 حرف على الأقل)';
    }

    if (!formData.family_agreement) {
      newErrors.agreements = 'يجب الموافقة على جميع الشروط';
    }
    if (!formData.agrees_to_follow_up) {
      newErrors.agreements = 'يجب الموافقة على جميع الشروط';
    }
    if (!formData.agrees_to_vet_care) {
      newErrors.agreements = 'يجب الموافقة على جميع الشروط';
    }
    if (!formData.agrees_to_training) {
      newErrors.agreements = 'يجب الموافقة على جميع الشروط';
    }

    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      const firstErrorKey = Object.keys(newErrors)[0];
      scrollToSection(firstErrorKey);
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      const safeAdopterLocation = normalizeLatLng(
        formData.adopter_latitude,
        formData.adopter_longitude,
      );
      if (!safeAdopterLocation) {
        Alert.alert('خطأ', 'يرجى تحديد موقع صحيح على الخريطة');
        return;
      }

      const requestData = {
        pet: petId,
        ...formData,
        adopter_latitude: safeAdopterLocation.lat,
        adopter_longitude: safeAdopterLocation.lng,
        adopter_age: parseInt(formData.adopter_age),
        family_members: parseInt(formData.family_members),
      };

      const response = await apiService.createAdoptionRequest(requestData);
      console.log('createAdoptionRequest response:', response);
      
      if (response.success) {
        Alert.alert(
          'تم الإرسال بنجاح',
          'تم إرسال طلب التبني بنجاح. سيتم مراجعته من قبل صاحب الحيوان.',
          [
            {
              text: 'حسناً',
              onPress: () => {
                if (onSuccess) onSuccess();
                onClose();
              },
            },
          ]
        );
      } else {
        const formatErrorData = (errorData: any): string | undefined => {
          if (!errorData) return undefined;
          if (typeof errorData === 'string') return errorData;
          if (typeof errorData === 'object') {
            if (errorData.error) {
              return formatErrorData(errorData.error);
            }
            const parts: string[] = [];
            Object.entries(errorData).forEach(([key, value]) => {
              const valueText = Array.isArray(value) ? value.join('، ') : `${value}`;
              parts.push(`${key}: ${valueText}`);
            });
            return parts.join('\n');
          }
          return undefined;
        };

        const serverMessage =
          formatErrorData(response.errorData) ||
          response.error ||
          'فشل إرسال الطلب';
        Alert.alert('خطأ', serverMessage);
      }
    } catch (error) {
      console.error('Error submitting adoption request:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const getImageUrl = (url?: string) => {
    return resolveMediaUrl(url, 'https://via.placeholder.com/400x300?text=No+Image');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 50 }]}>
          <Text style={styles.title}>طلب تبني</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="إغلاق">
            <AppIcon name="close" size={20} color="#666" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 50 }]}>
        <Text style={styles.title}>طلب تبني {pet?.name}</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="إغلاق">
          <AppIcon name="close" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView ref={scrollViewRef} style={styles.content}>
        {/* Pet Info Card */}
        <View style={styles.petCard}>
          <Image source={{ uri: getImageUrl(pet?.main_image) }} style={styles.petImage} />
          <View style={styles.petInfo}>
            <Text style={styles.petName}>{pet?.name}</Text>
            <Text style={styles.petDetails}>
              {pet?.pet_type_display} • {pet?.breed_name} • {pet?.age_display}
            </Text>
            <Text style={styles.petLocation}>📍 {pet?.location}</Text>
          </View>
        </View>

        {/* Basic Information */}
        <View style={styles.section} onLayout={onSectionLayout('adopter_name')}>
          <Text style={styles.sectionTitle}>المعلومات الأساسية</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>الاسم الكامل *</Text>
            <TextInput
              style={[styles.input, errors.adopter_name && styles.inputError]}
              value={formData.adopter_name}
              onChangeText={(text) => setFormData({...formData, adopter_name: text})}
              placeholder="أدخل اسمك الكامل"
            />
            {errors.adopter_name && <Text style={styles.errorText}>{errors.adopter_name}</Text>}
          </View>

          <View style={styles.inputGroup} onLayout={onSectionLayout('adopter_email')}>
            <Text style={styles.label}>البريد الإلكتروني *</Text>
            <TextInput
              style={[styles.input, errors.adopter_email && styles.inputError]}
              value={formData.adopter_email}
              onChangeText={(text) => setFormData({...formData, adopter_email: text})}
              placeholder="example@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {errors.adopter_email && <Text style={styles.errorText}>{errors.adopter_email}</Text>}
          </View>

          <View style={styles.inputGroup} onLayout={onSectionLayout('adopter_phone')}>
            <Text style={styles.label}>رقم الهاتف *</Text>
            <TextInput
              style={[styles.input, errors.adopter_phone && styles.inputError]}
              value={formData.adopter_phone}
              onChangeText={(text) => setFormData({...formData, adopter_phone: text})}
              placeholder="01234567890"
              keyboardType="phone-pad"
            />
            {errors.adopter_phone && <Text style={styles.errorText}>{errors.adopter_phone}</Text>}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]} onLayout={onSectionLayout('adopter_age')}>
              <Text style={styles.label}>العمر *</Text>
              <TextInput
                style={[styles.input, errors.adopter_age && styles.inputError]}
                value={formData.adopter_age}
                onChangeText={(text) => setFormData({...formData, adopter_age: text.replace(/[^0-9]/g, '')})}
                placeholder="25"
                keyboardType="number-pad"
                maxLength={3}
              />
              {errors.adopter_age && <Text style={styles.errorText}>{errors.adopter_age}</Text>}
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]} onLayout={onSectionLayout('adopter_occupation')}>
              <Text style={styles.label}>المهنة *</Text>
              <TextInput
                style={[styles.input, errors.adopter_occupation && styles.inputError]}
                value={formData.adopter_occupation}
                onChangeText={(text) => setFormData({...formData, adopter_occupation: text})}
                placeholder="مهندس، طبيب، إلخ"
              />
              {errors.adopter_occupation && <Text style={styles.errorText}>{errors.adopter_occupation}</Text>}
            </View>
          </View>
        </View>

        {/* Address */}
        <View style={styles.section} onLayout={onSectionLayout('adopter_address')}>
          <Text style={styles.sectionTitle}>العنوان</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>العنوان التفصيلي *</Text>
            <TextInput
              style={[styles.input, errors.adopter_address && styles.inputError]}
              value={formData.adopter_address}
              onChangeText={(text) => setFormData({...formData, adopter_address: text})}
              placeholder="المدينة، الحي، الشارع"
              multiline
            />
            {errors.adopter_address && <Text style={styles.errorText}>{errors.adopter_address}</Text>}
          </View>

          <TouchableOpacity 
            style={styles.locationButton}
            onPress={() => setShowLocationPicker(true)}
          >
            <Text style={styles.locationButtonText}>
              📍 {normalizedAdopterLocation ? 'تعديل الموقع على الخريطة' : 'حدد الموقع على الخريطة *'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Housing Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>معلومات السكن</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>نوع السكن</Text>
            <View style={styles.optionsRow}>
              {['apartment', 'house', 'villa'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.optionButton,
                    formData.housing_type === type && styles.optionButtonActive
                  ]}
                  onPress={() => setFormData({...formData, housing_type: type})}
                >
                  <Text style={[
                    styles.optionButtonText,
                    formData.housing_type === type && styles.optionButtonTextActive
                  ]}>
                    {type === 'apartment' ? 'شقة' : type === 'house' ? 'منزل' : 'فيلا'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>عدد أفراد العائلة</Text>
            <TextInput
              style={styles.input}
              value={formData.family_members}
              onChangeText={(text) => setFormData({...formData, family_members: text.replace(/[^0-9]/g, '')})}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        </View>

        {/* Experience */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>الخبرة والوقت</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>مستوى الخبرة في تربية الحيوانات</Text>
            <View style={styles.optionsRow}>
              {[
                { key: 'none', label: 'لا يوجد' },
                { key: 'basic', label: 'مبتدئ' },
                { key: 'experienced', label: 'متمرس' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionButton,
                    formData.experience_level === option.key && styles.optionButtonActive
                  ]}
                  onPress={() => setFormData({...formData, experience_level: option.key})}
                >
                  <Text style={[
                    styles.optionButtonText,
                    formData.experience_level === option.key && styles.optionButtonTextActive
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>الوقت المتاح للرعاية</Text>
            <View style={styles.optionsRow}>
              {[
                { key: 'low', label: 'قليل' },
                { key: 'medium', label: 'متوسط' },
                { key: 'high', label: 'كثير' },
              ].map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionButton,
                    formData.time_availability === option.key && styles.optionButtonActive
                  ]}
                  onPress={() => setFormData({...formData, time_availability: option.key})}
                >
                  <Text style={[
                    styles.optionButtonText,
                    formData.time_availability === option.key && styles.optionButtonTextActive
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Reason for Adoption */}
        <View style={styles.section} onLayout={onSectionLayout('reason_for_adoption')}>
          <Text style={styles.sectionTitle}>سبب التبني *</Text>
          <TextInput
            style={[styles.textArea, errors.reason_for_adoption && styles.inputError]}
            value={formData.reason_for_adoption}
            onChangeText={(text) => setFormData({...formData, reason_for_adoption: text})}
            placeholder="اشرح لماذا تريد تبني هذا الحيوان وكيف ستعتني به..."
            multiline
            numberOfLines={4}
          />
          {errors.reason_for_adoption && <Text style={styles.errorText}>{errors.reason_for_adoption}</Text>}
        </View>

        {/* Care Plans */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>خطط الرعاية (اختياري)</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>خطة التغذية</Text>
            <TextInput
              style={styles.textArea}
              value={formData.feeding_plan}
              onChangeText={(text) => setFormData({...formData, feeding_plan: text})}
              placeholder="ما هي خطتك لتغذية الحيوان؟"
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>خطة التمارين</Text>
            <TextInput
              style={styles.textArea}
              value={formData.exercise_plan}
              onChangeText={(text) => setFormData({...formData, exercise_plan: text})}
              placeholder="كيف ستوفر النشاط البدني للحيوان؟"
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>خطة الرعاية البيطرية</Text>
            <TextInput
              style={styles.textArea}
              value={formData.vet_care_plan}
              onChangeText={(text) => setFormData({...formData, vet_care_plan: text})}
              placeholder="كيف ستضمن الرعاية الصحية المنتظمة؟"
              multiline
              numberOfLines={2}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>خطة الطوارئ</Text>
            <TextInput
              style={styles.textArea}
              value={formData.emergency_plan}
              onChangeText={(text) => setFormData({...formData, emergency_plan: text})}
              placeholder="ماذا ستفعل في حالة الطوارئ الصحية؟"
              multiline
              numberOfLines={2}
            />
          </View>
        </View>

        {/* Agreements */}
        <View style={styles.section} onLayout={onSectionLayout('agreements')}>
          <Text style={styles.sectionTitle}>الموافقات المطلوبة *</Text>
          
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setFormData({...formData, family_agreement: !formData.family_agreement})}
          >
            <View style={[styles.checkbox, formData.family_agreement && styles.checkboxChecked]}>
              {formData.family_agreement && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>أوافق على أن جميع أفراد العائلة موافقون على التبني</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setFormData({...formData, agrees_to_follow_up: !formData.agrees_to_follow_up})}
          >
            <View style={[styles.checkbox, formData.agrees_to_follow_up && styles.checkboxChecked]}>
              {formData.agrees_to_follow_up && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>أوافق على زيارات المتابعة من صاحب الحيوان</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setFormData({...formData, agrees_to_vet_care: !formData.agrees_to_vet_care})}
          >
            <View style={[styles.checkbox, formData.agrees_to_vet_care && styles.checkboxChecked]}>
              {formData.agrees_to_vet_care && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>أتعهد بتوفير الرعاية البيطرية المنتظمة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setFormData({...formData, agrees_to_training: !formData.agrees_to_training})}
          >
            <View style={[styles.checkbox, formData.agrees_to_training && styles.checkboxChecked]}>
              {formData.agrees_to_training && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>أتعهد بتوفير التدريب المناسب للحيوان</Text>
          </TouchableOpacity>

          {errors.agreements && <Text style={styles.errorText}>{errors.agreements}</Text>}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>إرسال طلب التبني</Text>
          )}
        </TouchableOpacity>

        <View style={[styles.bottomPadding, { height: bottomSafeSpace }]} />
      </ScrollView>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <Modal visible={true} animationType="slide" onRequestClose={() => setShowLocationPicker(false)}>
          <MapLocationPicker
            showHeader
            initialLocation={
              normalizedAdopterLocation
                ? {
                    latitude: normalizedAdopterLocation.lat,
                    longitude: normalizedAdopterLocation.lng,
                    address: formData.adopter_address,
                  }
                : undefined
            }
            onLocationSelected={(location) => {
              const normalizedLocation = normalizeLatLng(location.latitude, location.longitude);
              if (!normalizedLocation) {
                if (__DEV__) {
                  console.warn('AdoptionRequestScreen: invalid location from picker ignored', location);
                }
                return;
              }
              setFormData(prev => ({
                ...prev,
                adopter_latitude: normalizedLocation.lat,
                adopter_longitude: normalizedLocation.lng,
                adopter_address: location.address || prev.adopter_address,
              }));
            }}
            onClose={() => setShowLocationPicker(false)}
            onChange={(text, coords) => {
              const normalizedCoords = coords
                ? normalizeLatLng(coords.lat, coords.lng)
                : null;
              if (__DEV__ && coords && !normalizedCoords) {
                console.warn('AdoptionRequestScreen: invalid coords from onChange ignored', coords);
              }
              setFormData(prev => ({
                ...prev,
                adopter_address: text,
                adopter_latitude: normalizedCoords?.lat ?? prev.adopter_latitude,
                adopter_longitude: normalizedCoords?.lng ?? prev.adopter_longitude,
              }));
            }}
          />
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  petCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  petImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
  },
  petInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  petName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  petDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  petLocation: {
    fontSize: 12,
    color: '#999',
  },
  section: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#f44336',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#f44336',
    fontSize: 12,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  locationButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  locationButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  optionButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  optionButtonText: {
    fontSize: 14,
    color: '#666',
  },
  optionButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: '#ddd',
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomPadding: {
    height: 40,
  },
});

export default AdoptionRequestScreen;
