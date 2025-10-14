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
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import { apiService, Breed, Pet } from '../../services/api';
import MapLocationPicker from '../../components/MapLocationPicker';
import ImagePicker from '../../components/ImagePicker';
import DocumentPickerComponent from '../../components/DocumentPicker';
import DocumentPicker, { DocumentPickerResponse } from 'react-native-document-picker';

interface EditPetScreenProps {
  petId: number;
  onClose: () => void;
  onPetUpdated?: () => void;
}

type EditPetFormState = {
  name: string;
  pet_type: 'cats' | 'dogs';
  breed: string;
  age_months: string;
  gender: 'M' | 'F';
  description: string;
  location: string;
  is_free: boolean;
  status: string;
  
  // Breeding history
  breeding_history: string;
  last_breeding_date: string;
  number_of_offspring: string;
  
  // Behavioral characteristics
  is_trained: boolean;
  good_with_kids: boolean;
  good_with_pets: boolean;
  
  // Hosting preference
  hosting_preference: string;
};

const INITIAL_FORM_STATE: EditPetFormState = {
  name: '',
  pet_type: 'cats',
  breed: '',
  age_months: '',
  gender: 'M',
  description: '',
  location: '',
  is_free: true,
  status: 'available',
  breeding_history: '',
  last_breeding_date: '',
  number_of_offspring: '0',
  is_trained: false,
  good_with_kids: true,
  good_with_pets: true,
  hosting_preference: 'flexible',
};

const STATUS_OPTIONS = [
  { value: 'available', label: 'متاح للتزاوج', emoji: '✅' },
  { value: 'unavailable', label: 'غير متاح', emoji: '⛔' },
];

// Removed hosting preferences (no longer needed in UI)

const EditPetScreen: React.FC<EditPetScreenProps> = ({ petId, onClose, onPetUpdated }) => {
  const [formData, setFormData] = useState<EditPetFormState>(INITIAL_FORM_STATE);
  const [breeds, setBreeds] = useState<Breed[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showBreedPicker, setShowBreedPicker] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  
  // Images - support up to 4 images
  const [petImages, setPetImages] = useState<string[]>([]);
  
  // Health documents
  const [healthDocuments, setHealthDocuments] = useState<DocumentPickerResponse[]>([]);
  const [vaccinationDocuments, setVaccinationDocuments] = useState<DocumentPickerResponse[]>([]);
  // Removed: disease free and additional certificate state

  // Scroll refs for error handling
  const scrollViewRef = useRef<ScrollView>(null);
  const fieldPositionsRef = useRef<Record<string, number>>({});

  const scrollToField = useCallback((key: string) => {
    const y = fieldPositionsRef.current[key];
    if (scrollViewRef.current) {
      const targetY = y !== undefined ? Math.max(0, y - 120) : 0;
      scrollViewRef.current.scrollTo({ y: targetY, animated: true });
    }
  }, []);

  // Load pet data and breeds
  useEffect(() => {
    loadPetData();
    loadBreeds();
  }, [petId]);

  const loadPetData = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPet(petId);
      
      if (response.success && response.data) {
        const pet = response.data;
        setFormData({
          name: pet.name || '',
          pet_type: (pet.pet_type as 'cats' | 'dogs') || 'cats',
          breed: pet.breed?.toString() || '',
          age_months: pet.age_months?.toString() || '',
          gender: (pet.gender as 'M' | 'F') || 'M',
          description: pet.description || '',
          location: pet.location || '',
          is_free: pet.is_free ?? true,
          status: pet.status || 'available',
          breeding_history: (pet as any).breeding_history || '',
          last_breeding_date: (pet as any).last_breeding_date || '',
          number_of_offspring: (pet as any).number_of_offspring?.toString() || '0',
          is_trained: (pet as any).is_trained ?? false,
          good_with_kids: (pet as any).good_with_kids ?? true,
          good_with_pets: (pet as any).good_with_pets ?? true,
          hosting_preference: (pet as any).hosting_preference || 'flexible',
        });
        
        // Load existing images
        const images: string[] = [];
        if (pet.main_image) images.push(pet.main_image);
        if (pet.image_2) images.push(pet.image_2);
        if (pet.image_3) images.push(pet.image_3);
        if (pet.image_4) images.push(pet.image_4);
        setPetImages(images);

        // Set coordinates if available
        if (pet.latitude && pet.longitude) {
          setLocationCoordinates({
            lat: Number(pet.latitude),
            lng: Number(pet.longitude),
          });
        }
      } else {
        Alert.alert('خطأ', 'فشل في تحميل بيانات الحيوان');
        onClose();
      }
    } catch (error) {
      console.error('Error loading pet data:', error);
      Alert.alert('خطأ', 'فشل في تحميل بيانات الحيوان');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const loadBreeds = async () => {
    try {
      const response = await apiService.getBreeds();
      if (Array.isArray(response)) {
        setBreeds(response);
      }
    } catch (error) {
      console.error('Error loading breeds:', error);
    }
  };

  const handleChange = (field: keyof EditPetFormState, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }

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

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) {
      newErrors.name = 'اسم الحيوان مطلوب';
      scrollToField('name');
    }

    if (!formData.breed) {
      newErrors.breed = 'السلالة مطلوبة';
      scrollToField('breed');
    }

    if (!formData.age_months || parseInt(formData.age_months) < 0) {
      newErrors.age_months = 'العمر مطلوب ويجب أن يكون أكبر من 0';
      scrollToField('age');
    }

    if (!formData.description.trim()) {
      newErrors.description = 'وصف الحيوان مطلوب';
      scrollToField('description');
    }

    if (!formData.location.trim()) {
      newErrors.location = 'الموقع مطلوب';
      scrollToField('location');
    }

    if (petImages.length === 0) {
      newErrors.images = 'يجب إضافة صورة واحدة على الأقل';
      scrollToField('images');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      Alert.alert('خطأ', 'يرجى تصحيح الأخطاء في النموذج');
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});

      const formDataToSend = new FormData();
      
      // Basic information
      formDataToSend.append('name', formData.name.trim());
      formDataToSend.append('pet_type', formData.pet_type);
      formDataToSend.append('breed', formData.breed);
      formDataToSend.append('age_months', formData.age_months);
      formDataToSend.append('gender', formData.gender);
      formDataToSend.append('description', formData.description.trim());
      formDataToSend.append('location', formData.location.trim());
      formDataToSend.append('is_free', formData.is_free.toString());
      formDataToSend.append('status', formData.status);

      // Removed: breeding info, behavior, hosting preference

      // Coordinates
      if (locationCoordinates) {
        formDataToSend.append('latitude', locationCoordinates.lat.toString());
        formDataToSend.append('longitude', locationCoordinates.lng.toString());
      }

      // Add images (up to 4)
      petImages.slice(0, 4).forEach((imageUri, index) => {
        // Only add new images (not existing URLs from server)
        if (!imageUri.startsWith('http')) {
          if (index === 0) {
            formDataToSend.append('main_image', {
              uri: imageUri,
              type: 'image/jpeg',
              name: `main_image.jpg`,
            } as any);
          } else {
            formDataToSend.append(`image_${index + 1}`, {
              uri: imageUri,
              type: 'image/jpeg',
              name: `pet_image_${index + 1}.jpg`,
            } as any);
          }
        }
      });

      // Add health documents
      healthDocuments.forEach((doc) => {
        formDataToSend.append('health_certificate', {
          uri: doc.uri,
          type: doc.type || 'application/pdf',
          name: doc.name || `health_cert.pdf`,
        } as any);
      });

      // Add vaccination documents
      vaccinationDocuments.forEach((doc) => {
        formDataToSend.append('vaccination_certificate', {
          uri: doc.uri,
          type: doc.type || 'application/pdf',
          name: doc.name || `vaccination_cert.pdf`,
        } as any);
      });

      // Removed: disease_free_certificate and additional_certificate

      const response = await apiService.updatePet(petId, formDataToSend);

      if (response.success) {
        Alert.alert('نجح', 'تم تحديث بيانات الحيوان بنجاح', [
          {
            text: 'موافق',
            onPress: () => {
              onPetUpdated?.();
              onClose();
            },
          },
        ]);
      } else {
        Alert.alert('خطأ', response.error || 'فشل في تحديث الحيوان');
      }
    } catch (error) {
      console.error('Error updating pet:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء تحديث الحيوان');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBreed = breeds.find(breed => breed.id.toString() === formData.breed);

  const filteredBreeds = useMemo(() => {
    return breeds.filter(breed => breed.pet_type === formData.pet_type);
  }, [breeds, formData.pet_type]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#02B7B4" />
        <Text style={styles.loadingText}>جاري تحميل بيانات الحيوان...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تعديل بيانات الحيوان</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Pet Images */}
        <View style={styles.section} onLayout={(e) => { fieldPositionsRef.current.images = e.nativeEvent.layout.y; }}>
          <Text style={styles.sectionTitle}>📷 صور الحيوان</Text>
          <ImagePicker
            images={petImages}
            onImagesChange={setPetImages}
            maxImages={4}
            title="يمكنك إضافة حتى 4 صور"
          />
          {errors.images ? <Text style={styles.errorText}>{errors.images}</Text> : null}
        </View>

        {/* Basic Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 المعلومات الأساسية</Text>
          
          <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.name = e.nativeEvent.layout.y; }}>
            <Text style={styles.label}>اسم الحيوان *</Text>
            <TextInput
              style={[styles.input, errors.name ? styles.inputError : null]}
              value={formData.name}
              onChangeText={(value) => handleChange('name', value)}
              placeholder="أدخل اسم الحيوان"
              placeholderTextColor="#95a5a6"
            />
            {errors.name ? <Text style={styles.errorText}>{errors.name}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>نوع الحيوان *</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  formData.pet_type === 'cats' && styles.typeOptionActive,
                ]}
                onPress={() => handleChange('pet_type', 'cats')}
              >
                <Text style={[styles.typeOptionText, formData.pet_type === 'cats' && styles.typeOptionTextActive]}>🐱 قطط</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeOption,
                  formData.pet_type === 'dogs' && styles.typeOptionActive,
                ]}
                onPress={() => handleChange('pet_type', 'dogs')}
              >
                <Text style={[styles.typeOptionText, formData.pet_type === 'dogs' && styles.typeOptionTextActive]}>🐕 كلاب</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.breed = e.nativeEvent.layout.y; }}>
            <Text style={styles.label}>السلالة *</Text>
            <TouchableOpacity
              style={[styles.input, styles.pickerInput]}
              onPress={() => setShowBreedPicker(true)}
            >
              <Text style={selectedBreed ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedBreed ? selectedBreed.name : 'اختر السلالة'}
              </Text>
              <Text style={styles.pickerIcon}>▼</Text>
            </TouchableOpacity>
            {errors.breed ? <Text style={styles.errorText}>{errors.breed}</Text> : null}
          </View>

          <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.age = e.nativeEvent.layout.y; }}>
            <Text style={styles.label}>العمر (بالأشهر) *</Text>
            <TextInput
              style={[styles.input, errors.age_months ? styles.inputError : null]}
              value={formData.age_months}
              onChangeText={(value) => handleChange('age_months', value)}
              placeholder="مثال: 12"
              placeholderTextColor="#95a5a6"
              keyboardType="numeric"
            />
            {errors.age_months ? <Text style={styles.errorText}>{errors.age_months}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>الجنس *</Text>
            <View style={styles.genderSelector}>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  formData.gender === 'M' && styles.genderOptionActive,
                ]}
                onPress={() => handleChange('gender', 'M')}
              >
                <Text style={[styles.genderOptionText, formData.gender === 'M' && styles.genderOptionTextActive]}>♂️ ذكر</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.genderOption,
                  formData.gender === 'F' && styles.genderOptionActive,
                ]}
                onPress={() => handleChange('gender', 'F')}
              >
                <Text style={[styles.genderOptionText, formData.gender === 'F' && styles.genderOptionTextActive]}>♀️ أنثى</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 الوصف</Text>
          <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.description = e.nativeEvent.layout.y; }}>
            <TextInput
              style={[
                styles.textArea,
                errors.description ? styles.inputError : null,
              ]}
              value={formData.description}
              onChangeText={(value) => handleChange('description', value)}
              placeholder="اكتب وصفاً مفصلاً عن الحيوان..."
              placeholderTextColor="#95a5a6"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            {errors.description ? <Text style={styles.errorText}>{errors.description}</Text> : null}
          </View>
        </View>

        {/* Location */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 الموقع</Text>
          <View style={styles.inputGroup} onLayout={(e) => { fieldPositionsRef.current.location = e.nativeEvent.layout.y; }}>
            <MapLocationPicker
              value={formData.location}
              onChange={handleLocationChange}
              placeholder="ابحث عن موقعك أو اختر من الخريطة"
            />
            {errors.location ? <Text style={styles.errorText}>{errors.location}</Text> : null}
          </View>
        </View>

        {/* Removed: Breeding Information and Behavioral Characteristics */}

        {/* Status */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚡ حالة الحيوان</Text>
          <View style={styles.inputGroup}>
            <View style={styles.statusGrid}>
              {STATUS_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.statusCard,
                    formData.status === option.value && styles.statusCardActive,
                  ]}
                  onPress={() => handleChange('status', option.value)}
                >
                  <Text style={styles.statusEmoji}>{option.emoji}</Text>
                  <Text style={[
                    styles.statusText,
                    formData.status === option.value && styles.statusTextActive
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Removed: Price section */}

        {/* Health Certificates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏥 الشهادات الصحية (اختيارية)</Text>
          <Text style={styles.sectionSubtitle}>
            📋 رفع الشهادات الصحية اختياري ويزيد من ثقة المالكين الآخرين
          </Text>
          
          <View style={styles.inputGroup}>
            <DocumentPickerComponent
              documents={vaccinationDocuments}
              onDocumentsChange={setVaccinationDocuments}
              maxDocuments={3}
              title="شهادة التطعيم"
              allowedTypes={['application/pdf', 'image/jpeg', 'image/png']}
            />
          </View>

          <View style={styles.inputGroup}>
            <DocumentPickerComponent
              documents={healthDocuments}
              onDocumentsChange={setHealthDocuments}
              maxDocuments={3}
              title="الشهادة الصحية البيطرية"
              allowedTypes={['application/pdf', 'image/jpeg', 'image/png']}
            />
          </View>

          {/* Removed: disease free and additional certificates */}
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
            <Text style={styles.submitButtonText}>💾 حفظ التغييرات</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Breed Picker Modal */}
      <Modal
        visible={showBreedPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBreedPicker(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>اختر السلالة</Text>
              <TouchableOpacity onPress={() => setShowBreedPicker(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              {filteredBreeds.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>
                    لا توجد سلالات متاحة لـ {formData.pet_type === 'cats' ? 'القطط' : 'الكلاب'}
                  </Text>
                </View>
              ) : (
                filteredBreeds.map((breed) => (
                  <TouchableOpacity
                    key={breed.id}
                    style={[
                      styles.breedOption,
                      formData.breed === breed.id.toString() && styles.breedOptionActive,
                    ]}
                    onPress={() => {
                      handleChange('breed', breed.id.toString());
                      setShowBreedPicker(false);
                    }}
                  >
                    <Text style={styles.breedOptionText}>{breed.name}</Text>
                    {formData.breed === breed.id.toString() && (
                      <Text style={styles.checkMark}>✓</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Location Picker Modal */}
      <Modal
        visible={showLocationPicker}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={styles.fullScreenModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>اختر الموقع</Text>
            <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
              <Text style={styles.modalCloseButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <MapLocationPicker
            value={formData.location}
            onChange={(location: string, coordinates?: { lat: number; lng: number }) => {
              handleLocationChange(location, coordinates);
              setShowLocationPicker(false);
            }}
          />
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#02B7B4',
    paddingTop: 50,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
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
    fontSize: 20,
    fontWeight: 'bold',
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
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#5a6c7d',
    marginBottom: 16,
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    color: '#34495e',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 4,
    fontStyle: 'italic',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
  },
  inputError: {
    borderColor: '#e74c3c',
    backgroundColor: '#fef5f5',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#e1e8ed',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
    height: 120,
    textAlignVertical: 'top',
  },
  pickerInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerText: {
    fontSize: 16,
    color: '#2c3e50',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#95a5a6',
  },
  pickerIcon: {
    fontSize: 12,
    color: '#95a5a6',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  typeOptionActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  typeOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
  },
  typeOptionTextActive: {
    color: '#fff',
  },
  genderSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  genderOption: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  genderOptionActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  genderOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
  },
  genderOptionTextActive: {
    color: '#fff',
  },
  priceSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  priceOption: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  priceOptionActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  priceOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
  },
  priceOptionTextActive: {
    color: '#fff',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusCard: {
    width: '48%',
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  statusCardActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  statusEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
  },
  statusTextActive: {
    color: '#fff',
  },
  optionsGrid: {
    gap: 8,
  },
  optionCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e1e8ed',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  optionCardActive: {
    backgroundColor: '#02B7B4',
    borderColor: '#02B7B4',
  },
  optionCardText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
  },
  optionCardTextActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  switchLabel: {
    fontSize: 15,
    color: '#2c3e50',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#02B7B4',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    elevation: 3,
    shadowColor: '#02B7B4',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#bdc3c7',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 13,
    marginTop: 6,
    marginLeft: 4,
  },
  bottomSpacer: {
    height: 40,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e8ed',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#7f8c8d',
    fontWeight: 'bold',
  },
  modalBody: {
    maxHeight: 400,
  },
  breedOption: {
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f2f6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breedOptionActive: {
    backgroundColor: '#e8f8f5',
  },
  breedOptionText: {
    fontSize: 16,
    color: '#2c3e50',
  },
  checkMark: {
    fontSize: 18,
    color: '#02B7B4',
    fontWeight: 'bold',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

export default EditPetScreen;
