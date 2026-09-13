import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
  BackHandler,
} from 'react-native';
import { apiService, Breed } from '../../services/api';
import MapLocationPicker from '../../components/MapLocationPicker';
import ImagePicker from '../../components/ImagePicker';
import DocumentPickerComponent from '../../components/DocumentPicker';
import { type DocumentPickerResponse } from '@react-native-documents/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AddPetScreenProps {
  onClose: () => void;
  onPetCreated?: (petId: number) => void;
}

type AddPetFormState = {
  name: string;
  pet_type: 'cats' | 'dogs';
  breed: string;
  age_months: string;
  gender: 'M' | 'F';
  description: string;
  location: string;
  is_free: boolean;
  status: string;
  available_for_adoption: boolean;
  hosting_preference: 'flexible' | 'my_place' | 'other_place';
};

const ADD_PET_DRAFT_STORAGE_KEY = 'add_pet_form_draft_v1';

const INITIAL_FORM_STATE: AddPetFormState = {
  name: '',
  pet_type: 'cats',
  breed: '',
  age_months: '',
  gender: 'M',
  description: '',
  location: '',
  is_free: true,
  status: 'available',
  available_for_adoption: false,
  hosting_preference: 'flexible',
};

const AddPetScreen: React.FC<AddPetScreenProps> = ({ onClose, onPetCreated }) => {
  const insets = useSafeAreaInsets();
  const bottomSafeSpace = Math.max(120, insets.bottom + 96);
  const [formData, setFormData] = useState<AddPetFormState>(() => ({ ...INITIAL_FORM_STATE }));

  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingBreeds, setLoadingBreeds] = useState(true);
  const [error, setError] = useState('');
  const [isRestoringDraft, setIsRestoringDraft] = useState(true);
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const skipNextPersistRef = useRef(false);
  
  // Images and documents
  const [petImages, setPetImages] = useState<string[]>([]);
  const [healthDocuments, setHealthDocuments] = useState<DocumentPickerResponse[]>([]);
  const [vaccinationDocuments, setVaccinationDocuments] = useState<DocumentPickerResponse[]>([]);

  // Scroll and field refs for auto-scroll to first error
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldPositionsRef = useRef<Record<string, number>>({});
  const submitLockRef = useRef(false);
  const nameInputRef = useRef<TextInput>(null);
  const ageInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);

  const scrollToField = useCallback((key: string) => {
    const y = fieldPositionsRef.current[key];
    if (scrollViewRef.current) {
      const targetY = y !== undefined ? Math.max(0, y - 120) : 0;
      scrollViewRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, []);

  const scrollToFieldByErrorMessage = useCallback((msg: string) => {
    const m = (msg || '').toLowerCase();
    if (m.includes('name') || m.includes('الاسم')) return scrollToField('name');
    if (m.includes('breed') || m.includes('السلالة')) return scrollToField('breed');
    if (m.includes('age') || m.includes('العمر')) return scrollToField('age');
    if (m.includes('description') || m.includes('الوصف')) return scrollToField('description');
    if (m.includes('location') || m.includes('الموقع') || m.includes('latitude') || m.includes('longitude')) return scrollToField('location');
    if (m.includes('image') || m.includes('الصور') || m.includes('main_image')) return scrollToField('images');
  }, [scrollToField]);

  const raiseError = useCallback((message: string, key?: 'name' | 'breed' | 'age' | 'location' | 'description' | 'images') => {
    setError(message);
    if (key) {
      scrollToField(key);
      if (key === 'name') nameInputRef.current?.focus();
      if (key === 'age') ageInputRef.current?.focus();
      if (key === 'description') descriptionInputRef.current?.focus();
    }
  }, [scrollToField]);

  useEffect(() => {
    loadBreeds();
  }, []);

  useEffect(() => {
    const restoreDraft = async () => {
      try {
        const savedDraft = await AsyncStorage.getItem(ADD_PET_DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          if (parsed?.formData && typeof parsed.formData === 'object') {
            setFormData(prev => ({ ...prev, ...parsed.formData }));
          }
          if (parsed?.locationCoordinates) {
            setLocationCoordinates(parsed.locationCoordinates);
          }
          if (Array.isArray(parsed?.petImages)) {
            setPetImages(parsed.petImages.slice(0, 4));
          }
          if (Array.isArray(parsed?.healthDocuments)) {
            setHealthDocuments(parsed.healthDocuments as DocumentPickerResponse[]);
          }
          if (Array.isArray(parsed?.vaccinationDocuments)) {
            setVaccinationDocuments(parsed.vaccinationDocuments as DocumentPickerResponse[]);
          }
        }
      } catch (storageError) {
        console.warn('Failed to restore add pet draft', storageError);
      } finally {
        setIsRestoringDraft(false);
      }
    };

    restoreDraft();
  }, []);

  const loadBreeds = async () => {
    try {
      setLoadingBreeds(true);
      console.log('🔍 Loading all breeds...');
      
      const breedsData = await apiService.getBreeds();
      console.log('🔍 Breeds loaded:', breedsData);
      
      if (Array.isArray(breedsData)) {
        setBreeds(breedsData);
        console.log('✅ Breeds loaded successfully:', breedsData.length);
        
        // عرض إحصائيات السلالات
        const catsBreeds = breedsData.filter(breed => breed.pet_type === 'cats');
        const dogsBreeds = breedsData.filter(breed => breed.pet_type === 'dogs');
        
        console.log('🐱 Cats breeds:', catsBreeds.length);
        console.log('🐕 Dogs breeds:', dogsBreeds.length);
      } else {
        setBreeds([]);
        console.error('❌ Breeds data is not an array:', breedsData);
        setError('خطأ في تحميل السلالات: البيانات غير صحيحة');
      }
    } catch (err) {
      console.error('❌ Error loading breeds:', err);
      setError('خطأ في تحميل السلالات: ' + (err instanceof Error ? err.message : 'خطأ غير معروف'));
    } finally {
      setLoadingBreeds(false);
    }
  };

  // Use useMemo to calculate availableBreeds
  const availableBreeds = useMemo(() => {
    console.log('🔍 Calculating availableBreeds for pet_type:', formData.pet_type);
    console.log('🔍 Total breeds:', breeds.length);
    const filtered = breeds.filter(breed => breed.pet_type === formData.pet_type);
    console.log('🔍 Filtered breeds:', filtered.length);
    return filtered;
  }, [breeds, formData.pet_type]);

  useEffect(() => {
    if (isRestoringDraft) {
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const persistDraft = async () => {
      try {
        const payload = {
          formData,
          locationCoordinates,
          petImages,
          healthDocuments,
          vaccinationDocuments,
        };
        await AsyncStorage.setItem(ADD_PET_DRAFT_STORAGE_KEY, JSON.stringify(payload));
      } catch (storageError) {
        console.warn('Failed to save add pet draft', storageError);
      }
    };

    persistDraft();
  }, [formData, locationCoordinates, petImages, healthDocuments, vaccinationDocuments, isRestoringDraft]);

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear breed when pet type changes
    if (field === 'pet_type') {
      setFormData(prev => ({ ...prev, breed: '' }));
    }
  };

  const handleLocationChange = (location: string, coordinates?: { lat: number; lng: number }) => {
    setFormData(prev => ({ ...prev, location }));
    if (coordinates) {
      setLocationCoordinates(coordinates);
    } else {
      setLocationCoordinates(null);
    }
  };

  const clearDraftAndResetForm = useCallback(async () => {
    skipNextPersistRef.current = true;
    try {
      await AsyncStorage.removeItem(ADD_PET_DRAFT_STORAGE_KEY);
    } catch (storageError) {
      console.warn('Failed to clear add pet draft after success', storageError);
    }

    setFormData({ ...INITIAL_FORM_STATE });
    setLocationCoordinates(null);
    setPetImages([]);
    setHealthDocuments([]);
    setVaccinationDocuments([]);
    setError('');
  }, []);

  const handleClosePress = useCallback(() => {
    if (loading) {
      Alert.alert('جاري الرفع', 'يرجى الانتظار حتى يكتمل رفع بيانات الحيوان.');
      return;
    }
    onClose();
  }, [loading, onClose]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleClosePress();
      return true;
    });
    return () => subscription.remove();
  }, [handleClosePress]);

  const handleAddPet = useCallback(async () => {
    if (submitLockRef.current) {
      return;
    }
    submitLockRef.current = true;
    let createdSuccessfully = false;
    // Validation
    if (!formData.name.trim()) {
      raiseError('يرجى إدخال اسم الحيوان', 'name');
      submitLockRef.current = false;
      return;
    }
    if (!formData.breed) {
      raiseError('يرجى اختيار السلالة', 'breed');
      submitLockRef.current = false;
      return;
    }
    if (!formData.age_months.trim()) {
      raiseError('يرجى إدخال العمر', 'age');
      submitLockRef.current = false;
      return;
    }
    if (!formData.location.trim()) {
      raiseError('يرجى إدخال الموقع', 'location');
      submitLockRef.current = false;
      return;
    }
    if (!formData.description.trim()) {
      raiseError('يرجى إدخال وصف للحيوان', 'description');
      submitLockRef.current = false;
      return;
    }
    if (!locationCoordinates) {
      raiseError('يرجى تحديد موقعك على الخريطة', 'location');
      submitLockRef.current = false;
      return;
    }
    if (petImages.length === 0) {
      raiseError('يرجى إضافة صورة واحدة على الأقل', 'images');
      submitLockRef.current = false;
      return;
    }

    try {
      setLoading(true);
      setError('');

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('pet_type', formData.pet_type);
      formDataToSend.append('breed', formData.breed);
      formDataToSend.append('age_months', formData.age_months);
      formDataToSend.append('gender', formData.gender);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('location', formData.location);
      formDataToSend.append('is_free', formData.is_free.toString());
      formDataToSend.append('hosting_preference', formData.hosting_preference);
      // Set status based on adoption toggle
      const finalStatus = formData.available_for_adoption ? 'available_for_adoption' : 'available';
      formDataToSend.append('status', finalStatus);

      // Add coordinates if available
      if (locationCoordinates) {
        formDataToSend.append('latitude', locationCoordinates.lat.toString());
        formDataToSend.append('longitude', locationCoordinates.lng.toString());
      }

      // Add images (backend accepts up to 4)
      petImages.slice(0, 4).forEach((imageUri, index) => {
        if (index === 0) {
          // First image should be main_image
          formDataToSend.append('main_image', {
            uri: imageUri,
            type: 'image/jpeg',
            name: `main_image.jpg`,
          } as any);
        } else {
          // Additional images as image_2, image_3, etc.
          formDataToSend.append(`image_${index + 1}`, {
            uri: imageUri,
            type: 'image/jpeg',
            name: `pet_image_${index + 1}.jpg`,
          } as any);
        }
      });

      // Add health documents
      healthDocuments.forEach((doc, index) => {
        formDataToSend.append('health_certificate', {
          uri: doc.uri,
          type: doc.type || 'application/pdf',
          name: doc.name || `health_cert_${index}.pdf`,
        } as any);
      });

      // Add vaccination documents
      vaccinationDocuments.forEach((doc, index) => {
        formDataToSend.append('vaccination_certificate', {
          uri: doc.uri,
          type: doc.type || 'application/pdf',
          name: doc.name || `vaccination_cert_${index}.pdf`,
        } as any);
      });

      console.log('📤 Sending pet data...');
      const response = await apiService.createPet(formDataToSend);

      if (response.success) {
        createdSuccessfully = true;
        const newPetId = response.data?.id;
        await clearDraftAndResetForm();
        if (typeof newPetId === 'number') {
          onPetCreated?.(newPetId);
        }
        Alert.alert('تمت الإضافة بنجاح', 'تم رفع بيانات الحيوان بنجاح.', [
          {
            text: 'حسناً',
            onPress: () => {
              submitLockRef.current = false;
              onClose();
            },
          },
        ], { cancelable: false });
      } else {
        setError(response.error || 'فشل في إضافة الحيوان');
        if (response.error) {
          scrollToFieldByErrorMessage(response.error);
        }
      }
    } catch (error) {
      console.error('Error adding pet:', error);
      setError('فشل في إضافة الحيوان');
    } finally {
      setLoading(false);
      if (!createdSuccessfully) {
        submitLockRef.current = false;
      }
    }
  }, [clearDraftAndResetForm, formData, healthDocuments, locationCoordinates, onClose, onPetCreated, petImages, raiseError, scrollToFieldByErrorMessage, vaccinationDocuments]);

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? insets.top + 10 : 50 }]}>
        <TouchableOpacity
          style={[styles.closeButton, loading && styles.closeButtonDisabled]}
          onPress={handleClosePress}
        >
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إضافة حيوان أليف</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Error Message */}
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>❌ {error}</Text>
          </View>
        ) : null}

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formGrid}>
            {/* Pet Name */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.name = e.nativeEvent.layout.y; }}>
              <Text style={styles.label}>اسم الحيوان *</Text>
              <TextInput
                ref={nameInputRef}
                style={styles.input}
                placeholder="أدخل اسم الحيوان"
                placeholderTextColor="#95a5a6"
                value={formData.name}
                onChangeText={(value) => handleInputChange('name', value)}
              />
            </View>

            {/* Pet Type */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>
                نوع الحيوان *
                <Text style={styles.labelNote}> (الاختيار الافتراضي: القطط)</Text>
              </Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioButton, formData.pet_type === 'cats' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('pet_type', 'cats')}
                >
                  <Text style={[styles.radioText, formData.pet_type === 'cats' && styles.radioTextActive]}>
                    🐱 قطط
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.radioButton, formData.pet_type === 'dogs' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('pet_type', 'dogs')}
                >
                  <Text style={[styles.radioText, formData.pet_type === 'dogs' && styles.radioTextActive]}>
                    🐕 كلاب
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Breed */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.breed = e.nativeEvent.layout.y; }}>
              <Text style={styles.label}>
                السلالة *
                <Text style={styles.labelNote}> ({availableBreeds.length} سلالة متاحة لـ {formData.pet_type === 'cats' ? 'القطط' : 'الكلاب'})</Text>
              </Text>
              {loadingBreeds ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color="#02B7B4" />
                  <Text style={styles.loadingText}>جاري تحميل السلالات...</Text>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.breedContainer}>
                    {availableBreeds.map((breed) => (
                      <TouchableOpacity
                        key={breed.id}
                        style={[styles.breedButton, formData.breed === breed.id.toString() && styles.breedButtonActive]}
                        onPress={() => handleInputChange('breed', breed.id.toString())}
                      >
                        <Text style={[styles.breedText, formData.breed === breed.id.toString() && styles.breedTextActive]}>
                          {breed.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              )}
              {availableBreeds.length === 0 && breeds.length > 0 && (
                <View style={styles.warningMessage}>
                  <Text style={styles.warningText}>
                    ⚠️ لا توجد سلالات متاحة لـ {formData.pet_type === 'cats' ? 'القطط' : 'الكلاب'} حالياً
                  </Text>
                </View>
              )}
            </View>

            {/* Gender */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>الجنس *</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioButton, formData.gender === 'M' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('gender', 'M')}
                >
                  <Text style={[styles.radioText, formData.gender === 'M' && styles.radioTextActive]}>
                    ♂ ذكر
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.radioButton, formData.gender === 'F' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('gender', 'F')}
                >
                  <Text style={[styles.radioText, formData.gender === 'F' && styles.radioTextActive]}>
                    ♀ أنثى
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Age */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.age = e.nativeEvent.layout.y; }}>
              <Text style={styles.label}>العمر (بالأشهر) *</Text>
              <TextInput
                ref={ageInputRef}
                style={styles.input}
                placeholder="مثال: 12"
                placeholderTextColor="#95a5a6"
                value={formData.age_months}
                onChangeText={(value) => handleInputChange('age_months', value)}
                keyboardType="numeric"
              />
            </View>

            {/* Description */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.description = e.nativeEvent.layout.y; }}>
              <Text style={styles.label}>الوصف *</Text>
              <TextInput
                ref={descriptionInputRef}
                style={[styles.input, styles.textArea]}
                placeholder="وصف الحيوان (إجباري)"
                placeholderTextColor="#95a5a6"
                value={formData.description}
                onChangeText={(value) => handleInputChange('description', value)}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Location */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.location = e.nativeEvent.layout.y; }}>
              <Text style={styles.label}>الموقع *</Text>
              <MapLocationPicker
                value={formData.location}
                onChange={handleLocationChange}
                onLocationSelected={(loc) => {
                  handleLocationChange(loc.address || formData.location, { lat: loc.latitude, lng: loc.longitude });
                }}
                placeholder="ابحث عن موقعك أو اختر من الخريطة"
              />
            </View>

            {/* Adoption Toggle */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>متاح للتبني</Text>
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setFormData({...formData, available_for_adoption: !formData.available_for_adoption})}
              >
                <Text style={styles.toggleLabel}>
                  هل تريد عرض هذا الحيوان للتبني؟
                </Text>
                <View style={[styles.toggle, formData.available_for_adoption && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, formData.available_for_adoption && styles.toggleThumbActive]} />
                </View>
              </TouchableOpacity>
              {formData.available_for_adoption && (
                <Text style={styles.helpText}>
                  سيتمكن المستخدمون الموثقون من تقديم طلبات تبني لهذا الحيوان
                </Text>
              )}
            </View>

            {/* Hosting Preference */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>الاستضافة *</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={[styles.radioButton, formData.hosting_preference === 'flexible' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('hosting_preference', 'flexible')}
                >
                  <Text style={[styles.radioText, formData.hosting_preference === 'flexible' && styles.radioTextActive]}>مرن</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.radioButton, formData.hosting_preference === 'my_place' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('hosting_preference', 'my_place')}
                >
                  <Text style={[styles.radioText, formData.hosting_preference === 'my_place' && styles.radioTextActive]}>عندي</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.radioButton, formData.hosting_preference === 'other_place' && styles.radioButtonActive]}
                  onPress={() => handleInputChange('hosting_preference', 'other_place')}
                >
                  <Text style={[styles.radioText, formData.hosting_preference === 'other_place' && styles.radioTextActive]}>عند الطرف الآخر</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helpText}>اختر مكان الاستضافة المفضل للمقابلة. يمكنك اختيار "مرن" إذا كان كلا الخيارين مناسبين.</Text>
            </View>

            {/* Pet Images */}
            <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.images = e.nativeEvent.layout.y; }}>
              <ImagePicker
                images={petImages}
                onImagesChange={setPetImages}
                maxImages={4}
                title="صور الحيوان"
              />
            </View>

            {/* Optional Certificates Section */}
            <View style={styles.certificatesSection}>
              <Text style={styles.certificatesSectionTitle}>الشهادات الصحية (اختيارية)</Text>
              <Text style={styles.certificatesSectionSubtitle}>
                رفع الشهادات الصحية اختياري ويزيد من ثقة المالكين الآخرين
              </Text>
            </View>

            {/* Health Documents */}
            <View style={styles.inputGroup}>
              <DocumentPickerComponent
                documents={healthDocuments}
                onDocumentsChange={setHealthDocuments}
                maxDocuments={3}
                title="الشهادة الصحية (اختيارية)"
                allowedTypes={['application/pdf', 'image/jpeg', 'image/png']}
              />
            </View>

            {/* Vaccination Documents */}
            <View style={styles.inputGroup}>
              <DocumentPickerComponent
                documents={vaccinationDocuments}
                onDocumentsChange={setVaccinationDocuments}
                maxDocuments={3}
                title="شهادة التطعيم (اختيارية)"
                allowedTypes={['application/pdf', 'image/jpeg', 'image/png']}
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleAddPet}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>إضافة الحيوان</Text>
            )}
          </TouchableOpacity>

          <View style={[styles.bottomSafeSpacer, { height: bottomSafeSpace }]} />
        </View>
      </View>
    </ScrollView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#02B7B4',
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButtonDisabled: {
    opacity: 0.55,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  formGrid: {
    gap: 20,
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 8,
  },
  labelNote: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: 'normal',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  radioButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
  },
  radioButtonActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  radioText: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  radioTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  breedContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  breedButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    backgroundColor: '#f8f9fa',
  },
  breedButtonActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  breedText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  breedTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#7f8c8d',
  },
  warningMessage: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffeaa7',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
  },
  warningText: {
    color: '#856404',
    fontSize: 14,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#02B7B4',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  bottomSafeSpacer: {
    width: '100%',
  },
  errorContainer: {
    backgroundColor: '#f8d7da',
    borderColor: '#f5c6cb',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  errorText: {
    color: '#721c24',
    fontSize: 14,
    textAlign: 'center',
  },
  certificatesSection: {
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#d1ecf1',
  },
  certificatesSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#02B7B4',
    marginBottom: 6,
  },
  certificatesSectionSubtitle: {
    fontSize: 13,
    color: '#5a6c7d',
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  toggleLabel: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ddd',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#4CAF50',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  helpText: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    paddingHorizontal: 4,
  },
});

export default AddPetScreen;
