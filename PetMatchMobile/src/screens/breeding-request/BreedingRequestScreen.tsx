import React, { memo, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  Modal,
  BackHandler,
  LayoutChangeEvent,
  FlatList,
  ListRenderItemInfo,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import FastImage from 'react-native-fast-image';

import { apiService, Pet } from '../../services/api';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import AppIcon from '../../components/icons/AppIcon';

interface BreedingRequestScreenProps {
  petId: number;
  onClose: () => void;
  onSuccess?: (firebaseChatId?: string) => void;
  onOpenPetDetails?: (petId: number) => void;
  onAddPet?: () => void;
}

const DEFAULT_PET_IMAGE =
  'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';

const getImageUrl = (url?: string) => resolveMediaUrl(url, DEFAULT_PET_IMAGE);

// Hoisted out of the screen component so the component type is stable across
// renders (re-creating this inline was dropping image load state per render).
// FastImage caches remote URIs so navigating back into this screen doesn't
// re-download or re-decode the same images.
const PetImage = memo<{ uri?: string; style?: any }>(({ uri, style }) => {
  const [src, setSrc] = useState<string>(getImageUrl(uri));
  useEffect(() => {
    setSrc(getImageUrl(uri));
  }, [uri]);
  return (
    <FastImage
      source={{ uri: src, priority: FastImage.priority.normal }}
      style={style}
      resizeMode={FastImage.resizeMode.cover}
      onError={() => setSrc(DEFAULT_PET_IMAGE)}
    />
  );
});
PetImage.displayName = 'PetImage';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const MONTH_OPTIONS = ARABIC_MONTHS.map((name, index) => ({ value: index + 1, label: name }));

const getDaysInMonth = (month: number, year: number) => new Date(year, month, 0).getDate();

interface BreedingPetOptionProps {
  pet: Pet;
  selected: boolean;
  onSelect: (petId: string) => void;
}

const BreedingPetOption = memo<BreedingPetOptionProps>(({ pet, selected, onSelect }) => {
  const handlePress = useCallback(() => onSelect(pet.id.toString()), [pet.id, onSelect]);
  return (
    <TouchableOpacity
      style={[styles.petOption, selected && styles.petOptionSelected]}
      onPress={handlePress}
    >
      <View style={styles.petOptionImageContainer}>
        <PetImage uri={pet.main_image} style={styles.petOptionImage} />
        {selected && (
          <View style={styles.selectedOverlay}>
            <Text style={styles.selectedIcon}>✓</Text>
          </View>
        )}
      </View>
      <View style={styles.petOptionDetails}>
        <Text style={styles.petOptionName}>{pet.name}</Text>
        <View style={styles.petOptionMeta}>
          <Text style={styles.petOptionMetaText}>{pet.gender_display}</Text>
          <Text style={styles.petOptionMetaText}>{pet.age_display}</Text>
        </View>
        <Text style={styles.petOptionBreed}>{pet.breed_name}</Text>
      </View>
    </TouchableOpacity>
  );
});
BreedingPetOption.displayName = 'BreedingPetOption';

// Fixed row height (pickerItem height 40 + marginVertical 2*2) drives
// getItemLayout and snapToInterval so scroll offsets are O(1) to compute.
const PICKER_ROW_HEIGHT = 44;

type PickerRow = { value: number; label: string };

interface PickerColumnProps {
  title: string;
  rows: PickerRow[];
  selected: number;
  onSelect: (value: number) => void;
}

// Virtualized picker column: replaces a plain ScrollView that was rendering
// every day/month/year up front. FlatList virtualization + getItemLayout make
// snap scrolling smooth even with long lists, and initialScrollIndex opens
// the column at the currently selected value.
const PickerColumn = memo<PickerColumnProps>(({ title, rows, selected, onSelect }) => {
  const getItemLayout = useCallback(
    (_: ArrayLike<PickerRow> | null | undefined, index: number) => ({
      length: PICKER_ROW_HEIGHT,
      offset: PICKER_ROW_HEIGHT * index,
      index,
    }),
    [],
  );
  const initialScrollIndex = useMemo(() => {
    const idx = rows.findIndex(r => r.value === selected);
    return idx >= 0 ? idx : 0;
  }, [rows, selected]);
  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<PickerRow>) => {
      const isSelected = item.value === selected;
      return (
        <TouchableOpacity
          style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
          onPress={() => onSelect(item.value)}
        >
          <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
            {item.label}
          </Text>
        </TouchableOpacity>
      );
    },
    [selected, onSelect],
  );

  return (
    <View style={styles.pickerColumn}>
      <Text style={styles.pickerLabel}>{title}</Text>
      <FlatList
        data={rows}
        keyExtractor={row => String(row.value)}
        renderItem={renderItem}
        style={styles.pickerScrollView}
        showsVerticalScrollIndicator={false}
        snapToInterval={PICKER_ROW_HEIGHT}
        decelerationRate="fast"
        getItemLayout={getItemLayout}
        initialScrollIndex={initialScrollIndex}
        extraData={selected}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </View>
  );
});
PickerColumn.displayName = 'PickerColumn';

const BreedingRequestScreen: React.FC<BreedingRequestScreenProps> = ({ petId, onClose, onSuccess, onOpenPetDetails, onAddPet }) => {
  const [targetPet, setTargetPet] = useState<Pet | null>(null);
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [success, setSuccess] = useState('');

  // Date picker state
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempDay, setTempDay] = useState<number>(new Date().getDate());
  const [tempMonth, setTempMonth] = useState<number>(new Date().getMonth() + 1);
  const [tempYear, setTempYear] = useState<number>(new Date().getFullYear());

  const [requestData, setRequestData] = useState({
    myPetId: '',
    message: '',
    contactPhone: '',
    agreedToTerms: false
  });

  const scrollViewRef = useRef<any>(null);
  const sectionPositions = useRef<Record<string, number>>({});
  // Track pending retries so scrollToSection doesn't fire after unmount.
  const pendingScrollTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const onSectionLayout = (key: string) => (event: LayoutChangeEvent) => {
    sectionPositions.current[key] = event.nativeEvent.layout.y;
  };

  const scrollToSection = useCallback((key: string, attempt = 0) => {
    const y = sectionPositions.current[key];
    if (y !== undefined && scrollViewRef.current) {
      const ref = scrollViewRef.current;
      const targetY = Math.max(y - 40, 0);
      if (typeof ref.scrollToPosition === 'function') {
        ref.scrollToPosition(0, targetY, true);
      } else if (typeof ref.scrollTo === 'function') {
        ref.scrollTo({ y: targetY, animated: true });
      }
    } else if (attempt < 5) {
      const id = setTimeout(() => scrollToSection(key, attempt + 1), 100);
      pendingScrollTimersRef.current.push(id);
    }
  }, []);

  useEffect(() => {
    return () => {
      pendingScrollTimersRef.current.forEach(clearTimeout);
      pendingScrollTimersRef.current = [];
    };
  }, []);

  const errorPriority = ['general', 'myPetId', 'contactPhone', 'agreedToTerms'];

  useEffect(() => {
    const firstErrorKey = errorPriority.find(key => errors[key]);
    if (firstErrorKey) {
      scrollToSection(firstErrorKey);
    }
  }, [errors]);

  // Validation functions
  const validatePhone = (phone: string) => {
    // Remove all spaces, dashes, and plus signs for validation
    const cleanPhone = phone.replace(/[\s\-\+\(\)]/g, '');
    
    // Egyptian numbers: +20 followed by 10 or 11 digits, or 01 followed by 9 digits
    const egyptianRegex = /^(20[0-9]{10,11}|01[0-9]{9})$/;
    
    // Saudi numbers: +966 followed by 9 digits, or 05 followed by 8 digits
    const saudiRegex = /^(966[0-9]{9}|05[0-9]{8})$/;
    
    // UAE numbers: +971 followed by 9 digits, or 05 followed by 8 digits
    const uaeRegex = /^(971[0-9]{9}|05[0-9]{8})$/;
    
    // German numbers: +49 followed by 10-12 digits, or 0 followed by 9-11 digits
    const germanRegex = /^(49[0-9]{10,12}|0[0-9]{9,11})$/;
    
    return egyptianRegex.test(cleanPhone) || 
           saudiRegex.test(cleanPhone) || 
           uaeRegex.test(cleanPhone) || 
           germanRegex.test(cleanPhone);
  };

  const validateDate = (date: string) => {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selectedDate >= today;
  };

  const validateForm = () => {
    const newErrors: {[key: string]: string} = {};

    if (!requestData.myPetId) {
      newErrors.myPetId = 'يجب اختيار حيوانك الأليف';
    }

    if (!requestData.contactPhone) {
      newErrors.contactPhone = 'رقم الهاتف مطلوب';
    } else if (!validatePhone(requestData.contactPhone)) {
      newErrors.contactPhone = 'رقم الهاتف غير صحيح. مثال صحيح:\n• مصر: 01234567890 أو +201234567890\n• السعودية: 0512345678 أو +966512345678\n• الإمارات: 0512345678 أو +971512345678\n• ألمانيا: 01234567890 أو +491234567890';
    }

    if (!requestData.agreedToTerms) {
      newErrors.agreedToTerms = 'يجب الموافقة على الشروط والأحكام';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    loadData();
  }, [petId]);

  useEffect(() => {
    const onBackPress = () => {
      if (showDatePicker) {
        setShowDatePicker(false);
        return true;
      }
      onClose();
      return true;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [showDatePicker, onClose]);

  const loadData = async () => {
    try {
      setLoading(true);
      setErrors({});
      const [targetPetData, myPetsData] = await Promise.all([
        apiService.getPet(petId),
        apiService.getMyPets()
      ]);

      if (targetPetData.success && targetPetData.data) {
        setTargetPet(targetPetData.data);
        
        // Filter my pets to show only compatible gender
        const compatiblePets = myPetsData?.data?.results?.filter(pet => 
          pet.gender !== targetPetData.data?.gender && 
          pet.pet_type === targetPetData.data?.pet_type &&
          pet.status === 'available'
        ) || [];
        
        setMyPets(compatiblePets);

        // Auto-select if only one compatible pet
        if (compatiblePets.length === 1) {
          setRequestData(prev => ({
            ...prev,
            myPetId: compatiblePets[0].id.toString(),
          }));
          if (errors.myPetId) {
            setErrors(prev => ({ ...prev, myPetId: '' }));
          }
        }

        if (compatiblePets.length === 0) {
          const petName = targetPetData.data?.name || 'هذا الحيوان';
          const petTypeLabel = targetPetData.data?.pet_type_display || 'غير محدد';
          const petGenderLabel = targetPetData.data?.gender_display || 'غير محدد';
          const oppositeGender = targetPetData.data?.gender === 'male' ? 'أنثى' : 'ذكر';
          setErrors({
            general: `لا يمكنك إرسال طلب تزاوج مع ${petName} لأنك لا تملك حيوان ${oppositeGender} متاح من نفس النوع.\n\nالشروط المطلوبة:\n• النوع: ${petTypeLabel}\n• الجنس: ${oppositeGender}\n• الحالة: متاح\n\nيرجى إضافة حيوان ${oppositeGender} متاح أولاً للمتابعة.`
          });
        }
      } else {
        setErrors({ general: 'فشل في تحميل تفاصيل الحيوان' });
      }
    } catch (err) {
      setErrors({ general: 'خطأ في تحميل البيانات' });
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = useCallback((field: string, value: string | boolean) => {
    setRequestData(prev => ({
      ...prev,
      [field]: value,
    }));
    // Functional setErrors keeps this callback stable (no errors dep) so child
    // components wrapped in React.memo don't re-render on every parent change.
    setErrors(prev => (prev[field] ? { ...prev, [field]: '' } : prev));
  }, []);

  const handleSelectMyPet = useCallback(
    (petId: string) => {
      handleChange('myPetId', petId);
    },
    [handleChange],
  );


  const showDatePickerModal = () => {
    const today = new Date();
    setTempDay(selectedDate.getDate());
    setTempMonth(selectedDate.getMonth() + 1);
    setTempYear(selectedDate.getFullYear());
    setShowDatePicker(true);
  };

  const confirmDateSelection = () => {
    const newDate = new Date(tempYear, tempMonth - 1, tempDay);
    setSelectedDate(newDate);
    const formattedDate = newDate.toISOString().split("T")[0];
    handleChange("meetingDate", formattedDate);
    setShowDatePicker(false);
  };

  const cancelDateSelection = () => {
    setShowDatePicker(false);
  };

  // Date-picker option lists. Days change with the selected month/year only;
  // months and years are stable for the lifetime of the screen.
  const dayOptions = useMemo<PickerRow[]>(
    () =>
      Array.from({ length: getDaysInMonth(tempMonth, tempYear) }, (_, i) => ({
        value: i + 1,
        label: String(i + 1),
      })),
    [tempMonth, tempYear],
  );
  const yearOptions = useMemo<PickerRow[]>(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => ({
      value: currentYear + i,
      label: String(currentYear + i),
    }));
  }, []);



  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return 'اختر تاريخ المقابلة';
    const date = new Date(dateString);
    return date.toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);
      setErrors({});
      setSuccess('');

      const payload: any = {
        target_pet: petId,
        requester_pet: parseInt(requestData.myPetId, 10),
        contact_phone: requestData.contactPhone,
        message: requestData.message,
      };

      const response = await apiService.createBreedingRequest(payload);

      if (response.success) {
        let firebaseChatId: string | undefined;
        const requestId = response.data?.id ?? response.data?.request?.id;
        if (requestId) {
          const lookup = await apiService.getChatRoomByBreedingRequest(requestId);
          if (lookup.success && lookup.data?.firebase_chat_id) {
            firebaseChatId = lookup.data.firebase_chat_id;
          } else {
            const created = await apiService.createChatRoom(requestId);
            firebaseChatId = created.success ? created.data?.chat_room?.firebase_chat_id : undefined;
          }
        }

        Alert.alert(
          'تم الإرسال بنجاح',
          'تم إرسال طلب المقابلة بنجاح. سيتم مراجعته من قبل صاحب الحيوان.',
          [
            {
              text: 'حسناً',
              onPress: () => {
                if (onSuccess) onSuccess(firebaseChatId);
                onClose();
              },
            },
          ]
        );
      } else {
        // Handle specific API errors
        if (response.error?.includes('already exists')) {
          setErrors({ general: 'لديك طلب مقابلة سابق مع هذا الحيوان' });
        } else if (response.error?.includes('not available')) {
          setErrors({ general: 'هذا الحيوان غير متاح للتزاوج حالياً' });
        } else if (response.error?.includes('phone')) {
          setErrors({ contactPhone: 'رقم الهاتف غير صحيح' });
        } else {
          setErrors({ general: response.error || 'تعذر إرسال طلب المقابلة' });
        }
      }
    } catch (err) {
      setErrors({ general: 'حدث خطأ في إرسال الطلب' });
      console.error('Error submitting request:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>جاري تحميل البيانات...</Text>
      </View>
    );
  }

  if (!targetPet) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>خطأ في التحميل</Text>
        <Text style={styles.errorText}>لم يتم العثور على الحيوان</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
          <Text style={styles.primaryButtonText}>إغلاق</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      ref={scrollViewRef}
      style={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>طلب مقابلة للتزاوج</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Hero Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroIcon}>
            <AppIcon name="heart" size={32} color="#FF4D6D" filled />
          </View>
          <Text style={styles.heroTitle}>طلب مقابلة للتزاوج</Text>
          <Text style={styles.heroSubtitle}>
            اطلب مقابلة تعارف مع {targetPet.name} للتزاوج
          </Text>
        </View>

        {/* Target Pet Card */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => targetPet?.id && onOpenPetDetails?.(targetPet.id)}
          style={styles.targetPetCard}
        >
          <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><AppIcon name="paw" size={18} color="#FF6B35"/><Text style={[styles.sectionTitle,{marginBottom:0,marginLeft:6}]}>الحيوان المطلوب للتزاوج</Text></View>
          
          <View style={styles.petInfoContainer}>
            <PetImage uri={targetPet.main_image} style={styles.targetPetImage} />
            
            <View style={styles.targetPetDetails}>
              <Text style={styles.targetPetName}>{targetPet.name}</Text>
              
              <View style={styles.attributesContainer}>
                <View style={styles.attribute}>
                  <Text style={styles.attributeIcon}>⚥</Text>
                  <Text style={styles.attributeText}>{targetPet.gender_display}</Text>
                </View>
                <View style={styles.attribute}>
                  <AppIcon name="calendar" size={14} color="#F59E0B"/>
                  <Text style={styles.attributeText}>{targetPet.age_display}</Text>
                </View>
              </View>
              
              <View style={styles.attributesContainer}>
                <View style={styles.attribute}>
                  <AppIcon name="paperclip" size={14} color="#3B82F6"/>
                  <Text style={styles.attributeText}>{targetPet.breed_name}</Text>
                </View>
                <View style={styles.attribute}>
                  <AppIcon name="location" size={14} color="#64748B"/>
                  <Text style={styles.attributeText}>{targetPet.location}</Text>
                </View>
              </View>
              
              <View style={styles.statusBadge}>
                <View style={{flexDirection:'row',alignItems:'center',gap:4}}><AppIcon name="heart" size={14} color="#FF4D6D" filled/><Text style={styles.statusBadgeText}>متاح للتزاوج مجاناً</Text></View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Error/Success Messages */}
        {errors.general && (
          <View
            style={styles.errorMessage}
            onLayout={onSectionLayout('general')}
          >
            <Text style={styles.messageIcon}>⚠️</Text>
            <View style={styles.messageContent}>
              <Text style={[styles.messageTitle, styles.errorMessageTitle]}>لا توجد حيوانات مناسبة</Text>
              <Text style={[styles.messageText, styles.errorMessageText]}>{errors.general}</Text>
              {myPets.length === 0 && onAddPet && (
                <TouchableOpacity
                  style={styles.addPetButton}
                  onPress={() => {
                    onClose();
                    onAddPet();
                  }}
                >
                  <View style={{flexDirection:'row',alignItems:'center',gap:8}}><AppIcon name="plus" size={18} color="#02B7B4"/><Text style={styles.addPetButtonText}>إضافة حيوان جديد</Text></View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {success && (
          <View style={styles.successMessage}>
            <Text style={styles.messageIcon}>✅</Text>
            <View style={styles.messageContent}>
              <Text style={[styles.messageTitle, styles.successMessageTitle]}>تم بنجاح!</Text>
              <Text style={[styles.messageText, styles.successMessageText]}>{success}</Text>
            </View>
          </View>
        )}



        {/* My Pets Selection */}
        {myPets.length > 0 && (
          <View
            style={styles.formCard}
            onLayout={onSectionLayout('myPetId')}
          >
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><AppIcon name="paw" size={18} color="#FF6B35"/><Text style={[styles.sectionTitle,{marginBottom:0,marginLeft:6}]}>اختر حيوانك الأليف</Text></View>
            <Text style={styles.sectionDescription}>
              اختر الحيوان الذي تريد تزويجه مع {targetPet.name}
            </Text>
            
            <View style={styles.petsGrid}>
              {myPets.map(pet => (
                <BreedingPetOption
                  key={pet.id}
                  pet={pet}
                  selected={requestData.myPetId === pet.id.toString()}
                  onSelect={handleSelectMyPet}
                />
              ))}
            </View>
            
            {errors.myPetId && (
              <View style={styles.fieldError}>
                <Text style={styles.fieldErrorIcon}>⚠️</Text>
                <Text style={styles.fieldErrorText}>{errors.myPetId}</Text>
              </View>
            )}
          </View>
        )}

        {/* Form Fields */}
        {myPets.length > 0 && (
          <View style={styles.formCard}>
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><AppIcon name="chat" size={18} color="#3B82F6"/><Text style={[styles.sectionTitle,{marginBottom:0,marginLeft:6}]}>تفاصيل التواصل</Text></View>
            
            {/* Contact Phone */}
            <View
              style={styles.inputGroup}
              onLayout={onSectionLayout('contactPhone')}
            >
              <Text style={styles.label}>
                رقم الهاتف للتواصل <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.phoneInputContainer}>
                <TextInput
                  style={[
                    styles.textInput,
                    errors.contactPhone ? styles.inputError : null
                  ]}
                  placeholder="01234567890 أو +201234567890"
                  value={requestData.contactPhone}
                  onChangeText={(value) => handleChange('contactPhone', value)}
                  keyboardType="phone-pad"
                  maxLength={20}
                />
                <AppIcon name="chat" size={18} color="#3B82F6"/>
              </View>
              {errors.contactPhone && (
                <View style={styles.fieldError}>
                  <Text style={styles.fieldErrorIcon}>⚠️</Text>
                  <Text style={styles.fieldErrorText}>{errors.contactPhone}</Text>
                </View>
              )}
              <Text style={styles.fieldHint}>رقم هاتفك للتواصل وتنسيق المقابلة (يقبل أرقام مصر، السعودية، الإمارات، وألمانيا)</Text>
            </View>
          </View>
        )}

        {/* Safety Guidelines */}
        {myPets.length > 0 && (
          <View style={styles.safetyCard}>
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><AppIcon name="shield-check" size={18} color="#3B82F6"/><Text style={[styles.sectionTitle,{marginBottom:0,marginLeft:6}]}>إرشادات السلامة</Text></View>
            
            <View style={styles.safetyGrid}>
              <View style={styles.safetyItem}>
                <View style={styles.safetyIconContainer}>
                  <AppIcon name="calendar" size={22} color="#64748B"/>
                </View>
                <View style={styles.safetyContent}>
                  <Text style={styles.safetyTitle}>موعد محدد</Text>
                  <Text style={styles.safetyDescription}>
                    حدد موعداً مناسباً لكلا الطرفين
                  </Text>
                </View>
              </View>

              <View style={styles.safetyItem}>
                <View style={styles.safetyIconContainer}>
                  <AppIcon name="location" size={22} color="#64748B"/>
                </View>
                <View style={styles.safetyContent}>
                  <Text style={styles.safetyTitle}>مكان آمن</Text>
                  <Text style={styles.safetyDescription}>
                    اختر مكاناً عاماً وآمناً للمقابلة
                  </Text>
                </View>
              </View>

              <View style={styles.safetyItem}>
                <View style={styles.safetyIconContainer}>
                  <AppIcon name="user" size={22} color="#1e293b"/>
                </View>
                <View style={styles.safetyContent}>
                  <Text style={styles.safetyTitle}>مقابلة شخصية</Text>
                  <Text style={styles.safetyDescription}>
                    تعرف على الطرف الآخر قبل الموافقة
                  </Text>
                </View>
              </View>

              <View style={styles.safetyItem}>
                <View style={styles.safetyIconContainer}>
                  <AppIcon name="shield-check" size={22} color="#14B8A6"/>
                </View>
                <View style={styles.safetyContent}>
                  <Text style={styles.safetyTitle}>فحص بيطري</Text>
                  <Text style={styles.safetyDescription}>
                    تأكد من صحة الحيوانين قبل التزاوج
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={styles.safetyTip}>
              <AppIcon name="shield-check" size={18} color="#F59E0B"/>
              <Text style={styles.safetyTipText}>
                <Text style={styles.safetyTipBold}>نصيحة:</Text> نوصي بإجراء فحص بيطري للحيوانين قبل التزاوج لضمان الصحة والسلامة
              </Text>
            </View>
          </View>
        )}

        {/* Message */}
        {myPets.length > 0 && (
          <View style={styles.formCard}>
            <View style={{flexDirection:'row',alignItems:'center',marginBottom:8}}><AppIcon name="chat" size={18} color="#3B82F6"/><Text style={[styles.sectionTitle,{marginBottom:0,marginLeft:6}]}>رسالة شخصية</Text></View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>رسالة تعريفية (اختيارية)</Text>
              <TextInput
                style={styles.textArea}
                placeholder="اكتب رسالة تعريفية عن حيوانك وسبب اهتمامك بهذه المقابلة..."
                value={requestData.message}
                onChangeText={(value) => handleChange('message', value)}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <Text style={styles.fieldHint}>
                اكتب رسالة تعريفية لتزيد من فرص قبول طلبك
              </Text>
            </View>
          </View>
        )}

        {/* Terms Agreement */}
        {myPets.length > 0 && (
          <View
            style={[
              styles.termsCard,
              errors.agreedToTerms ? styles.termsCardError : null
            ]}
            onLayout={onSectionLayout('agreedToTerms')}
          >
            <TouchableOpacity
              style={styles.termsButton}
              onPress={() => handleChange('agreedToTerms', !requestData.agreedToTerms)}
            >
              <View style={[
                styles.checkbox,
                requestData.agreedToTerms && styles.checkboxSelected
              ]}>
                {requestData.agreedToTerms && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <View style={styles.termsTextContainer}>
                <Text style={styles.termsTitle}>أوافق على الشروط والأحكام</Text>
                <Text style={styles.termsDescription}>
                  أتحمل المسؤولية الكاملة عن المقابلة والفحص البيطري وأتعهد بالالتزام بإرشادات السلامة
                </Text>
              </View>
            </TouchableOpacity>
            
            {errors.agreedToTerms && (
              <View style={styles.fieldError}>
                <Text style={styles.fieldErrorIcon}>⚠️</Text>
                <Text style={styles.fieldErrorText}>{errors.agreedToTerms}</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        {myPets.length > 0 && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>إلغاء</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.primaryButton,
                submitting && styles.primaryButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}><AppIcon name="heart" size={18} color="#fff" filled/><Text style={styles.primaryButtonText}>إرسال طلب المقابلة</Text></View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Custom Date Picker Modal */}
      <Modal
        transparent={true}
        animationType="slide"
        visible={showDatePicker}
        onRequestClose={cancelDateSelection}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={cancelDateSelection}
              >
                <Text style={styles.modalButtonText}>إلغاء</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>اختر تاريخ المقابلة</Text>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={confirmDateSelection}
              >
                <Text style={[styles.modalButtonText, styles.confirmButton]}>تأكيد</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.datePickerContainer}>
              <PickerColumn
                title="اليوم"
                rows={dayOptions}
                selected={tempDay}
                onSelect={setTempDay}
              />
              <PickerColumn
                title="الشهر"
                rows={MONTH_OPTIONS}
                selected={tempMonth}
                onSelect={setTempMonth}
              />
              <PickerColumn
                title="السنة"
                rows={yearOptions}
                selected={tempYear}
                onSelect={setTempYear}
              />
            </View>
          </View>
        </View>
      </Modal>

    </KeyboardAwareScrollView>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  loadingText: {
    marginTop: 15,
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 20,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 30,
    textAlign: 'center',
    lineHeight: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#64748b',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  placeholder: {
    width: 36,
  },
  content: {
    padding: 20,
  },
  
  // Hero Card
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 30,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.1)',
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  heroIconText: {
    fontSize: 36,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    color: '#64748b',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Target Pet Card
  targetPetCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.1)',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 15,
  },
  sectionDescription: {
    color: '#64748b',
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  petInfoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  targetPetImage: {
    width: 140,
    height: 140,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    marginRight: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  targetPetDetails: {
    flex: 1,
  },
  targetPetName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  attributesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  attribute: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  attributeIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  attributeText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    flex: 1,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 10,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Message Cards
  errorMessage: {
    backgroundColor: '#fef2f2',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  successMessage: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 2,
    borderColor: '#bbf7d0',
  },
  messageIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  messageContent: {
    flex: 1,
  },
  messageTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'right',
  },
  errorMessageTitle: {
    color: '#991b1b',
  },
  errorMessageText: {
    color: '#7f1d1d',
  },
  successMessageTitle: {
    color: '#166534',
  },
  successMessageText: {
    color: '#14532d',
  },
  addPetButton: {
    backgroundColor: '#667eea',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  addPetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Form Card
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },

  // Pet Selection
  petsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  petOption: {
    width: (width - 80) / 2,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 15,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  petOptionSelected: {
    borderColor: '#667eea',
    backgroundColor: 'rgba(102,126,234,0.05)',
    shadowColor: '#667eea',
    shadowOpacity: 0.2,
    elevation: 4,
  },
  petOptionImageContainer: {
    position: 'relative',
    alignSelf: 'center',
    marginBottom: 12,
  },
  petOptionImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(102,126,234,0.8)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  petOptionDetails: {
    alignItems: 'center',
  },
  petOptionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 6,
    textAlign: 'center',
  },
  petOptionMeta: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  petOptionMetaText: {
    fontSize: 11,
    color: '#64748b',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  petOptionBreed: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '500',
  },

  // Form Fields
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  required: {
    color: '#dc2626',
  },
  datePickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  datePickerText: {
    fontSize: 16,
    color: '#1e293b',
  },
  placeholderText: {
    color: '#94a3b8',
  },
  datePickerIcon: {
    fontSize: 20,
  },
  phoneInputContainer: {
    position: 'relative',
  },
  textInput: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    paddingRight: 50,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
    fontSize: 18,
  },
  textArea: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
    backgroundColor: '#fff',
    height: 100,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  fieldError: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  fieldErrorIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  fieldErrorText: {
    color: '#dc2626',
    fontSize: 14,
    flex: 1,
  },
  fieldHint: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },

  // Safety Guidelines
  safetyCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.2)',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  safetyGrid: {
    marginBottom: 15,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.05)',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.1)',
  },
  safetyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  safetyIcon: {
    fontSize: 20,
    color: '#fff',
  },
  safetyContent: {
    flex: 1,
    paddingTop: 2,
  },
  safetyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#16a34a',
    marginBottom: 4,
  },
  safetyDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  safetyTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22c55e',
  },
  safetyTipIcon: {
    fontSize: 18,
    marginRight: 10,
    marginTop: 1,
  },
  safetyTipText: {
    fontSize: 14,
    color: '#1e293b',
    flex: 1,
    lineHeight: 20,
  },
  safetyTipBold: {
    fontWeight: 'bold',
  },

  // Terms Agreement
  termsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(99,102,241,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  termsCardError: {
    borderColor: '#dc2626',
    backgroundColor: '#fef2f2',
  },
  termsButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkboxSelected: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  termsTextContainer: {
    flex: 1,
  },
  termsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 6,
  },
  termsDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
    gap: 15,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    minHeight: 56,
  },
  primaryButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#d1d5db',
    minHeight: 56,
  },
  secondaryButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },

  // Modal styles for iOS date picker
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  modalButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  modalButtonText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '600',
  },
  confirmButton: {
    color: '#667eea',
  },

  // Custom Date Picker styles
  datePickerContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    height: 250,
  },
  pickerColumn: {
    flex: 1,
    marginHorizontal: 5,
  },
  pickerLabel: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 10,
  },
  pickerScrollView: {
    maxHeight: 200,
  },
  pickerItem: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 8,
  },
  pickerItemSelected: {
    backgroundColor: '#667eea',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  pickerItemTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default BreedingRequestScreen;
