import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  StatusBar,
  BackHandler,
  SafeAreaView,
} from 'react-native';
import { apiService, Pet } from '../../services/api';
import BreedingRequestScreen from '../breeding-request/BreedingRequestScreen';
import { useCallback } from 'react';

// Reuse a lightweight address display that resolves coords to human-readable when needed
const reverseGeocodeCache = new Map<string, string>();
const PetLocationDisplay: React.FC<{ pet: Pet; style?: any }> = ({ pet, style }) => {
  const [address, setAddress] = useState<string>(pet.location || 'غير محدد');
  const [loading, setLoading] = useState(false);

  const getAddressFromCoordinates = useCallback(async (lat: number, lng: number): Promise<string> => {
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = reverseGeocodeCache.get(key);
    if (cached) return cached;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=ar,en`,
        {
          signal: controller.signal,
          headers: {
            'User-Agent': 'PetMatchMobile/1.0 (contact@petmatch.com)',
            'Accept': 'application/json',
          },
        }
      );
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const full: string | undefined = data?.display_name;
      if (full && full.length) {
        const parts = full.split(', ').slice(0, 3).join(', ');
        const value = parts || full;
        reverseGeocodeCache.set(key, value);
        return value;
      }
      return 'العنوان غير متاح';
    } catch (_e) {
      return reverseGeocodeCache.get(key) || 'العنوان غير متاح';
    }
  }, []);

  useEffect(() => {
    const resolveAddress = async () => {
      if (pet.location && !/^\s*-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?\s*$/.test(pet.location) && !pet.latitude && !pet.longitude) {
        setAddress(pet.location);
        return;
      }
      if (pet.latitude && pet.longitude) {
        setLoading(true);
        const addr = await getAddressFromCoordinates(Number(pet.latitude), Number(pet.longitude));
        setAddress(addr);
        if (pet.id) {
          apiService.updatePetLocationIfNeeded(pet.id, pet.location, addr);
        }
        setLoading(false);
        return;
      }
      const m = pet.location?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
      if (m) {
        setLoading(true);
        const addr = await getAddressFromCoordinates(parseFloat(m[1]), parseFloat(m[2]));
        setAddress(addr);
        if (pet.id) {
          apiService.updatePetLocationIfNeeded(pet.id, pet.location, addr);
        }
        setLoading(false);
        return;
      }
    };
    resolveAddress();
  }, [pet.location, pet.latitude, pet.longitude, getAddressFromCoordinates]);

  return (
    <Text style={style}>📍 {loading ? 'جاري التحميل...' : address}</Text>
  );
};

interface PetDetailsScreenProps {
  petId: number;
  onClose: () => void;
}

const PetDetailsScreen: React.FC<PetDetailsScreenProps> = ({ petId, onClose }) => {
  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showBreedingRequest, setShowBreedingRequest] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);

  useEffect(() => {
    loadPetDetails();
  }, [petId]);

  useEffect(() => {
    const onBackPress = () => {
      if (showBreedingRequest) {
        setShowBreedingRequest(false);
        return true;
      }
      if (showImageModal) {
        setShowImageModal(false);
        return true;
      }
      onClose();
      return true;
    };

    BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
  }, [showBreedingRequest, showImageModal, onClose]);

  const loadPetDetails = async () => {
    try {
      setLoading(true);
      const response = await apiService.getPet(petId);
      
      if (response.success && response.data) {
        setPet(response.data);
        console.log('Pet details loaded:', response.data);
      } else {
        Alert.alert('خطأ', 'فشل في تحميل تفاصيل الحيوان');
        onClose();
      }
    } catch (error) {
      console.error('Error loading pet details:', error);
      Alert.alert('خطأ', 'فشل في تحميل تفاصيل الحيوان');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async () => {
    try {
      const response = await apiService.toggleFavorite(petId);
      if (response.success) {
        setIsFavorite(!isFavorite);
        Alert.alert('نجح', isFavorite ? 'تم إزالة من المفضلة' : 'تم إضافة للمفضلة');
      }
    } catch (error) {
      Alert.alert('خطأ', 'فشل في تحديث المفضلة');
    }
  };

  const requestBreeding = () => {
    setShowBreedingRequest(true);
  };

  const hideBreedingRequest = () => {
    setShowBreedingRequest(false);
  };

  const openImageModal = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setShowImageModal(true);
  };

  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedImage(null);
  };

  const getImageUrl = (url?: string) => {
    return url?.replace('http://', 'https://') || 
           'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80';
  };

  // Get additional images if available
  const getAdditionalImages = () => {
    const images: string[] = [];
    if (pet?.image_2) images.push(pet.image_2);
    if (pet?.image_3) images.push(pet.image_3);
    if (pet?.image_4) images.push(pet.image_4);
    if (pet?.health_certificate) images.push(pet.health_certificate);
    if (pet?.vaccination_certificate) images.push(pet.vaccination_certificate);
    return images.filter(Boolean);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>جاري تحميل التفاصيل...</Text>
      </View>
    );
  }

  if (!pet) {
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

  if (showBreedingRequest) {
    return (
      <BreedingRequestScreen 
        petId={petId} 
        onClose={hideBreedingRequest} 
      />
    );
  }

  const additionalImages = getAdditionalImages();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Text style={styles.headerButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>تفاصيل الحيوان</Text>
        <TouchableOpacity style={styles.headerButton} onPress={toggleFavorite}>
          <Text style={styles.favoriteIcon}>{isFavorite ? '❤️' : '🤍'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Main Image */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => openImageModal(getImageUrl(pet.main_image))}
        >
          <Image
            source={{ uri: getImageUrl(pet.main_image) }}
            style={styles.mainImage}
            onError={(error) => {
              console.log('❌ Main image load error:', error);
            }}
          />
          <View style={styles.imageOverlay}>
            <Text style={styles.imageOverlayText}>اضغط للتكبير 🔍</Text>
          </View>
        </TouchableOpacity>

        {/* Additional Images */}
        {additionalImages.length > 0 && (
          <View style={styles.additionalImagesContainer}>
            <Text style={styles.sectionTitle}>📸 صور إضافية</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.additionalImagesScroll}>
              {additionalImages.map((imageUrl, index) => (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.85}
                  onPress={() => openImageModal(getImageUrl(imageUrl))}
                  style={styles.additionalImageContainer}
                >
                  <Image
                    source={{ uri: getImageUrl(imageUrl) }}
                    style={styles.additionalImage}
                  />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.petInfo}>
          {/* Pet Header */}
          <View style={styles.petHeaderCard}>
            <View style={styles.petHeaderContent}>
              <Text style={styles.petName}>{pet.name}</Text>
              <Text style={styles.petBreed}>{pet.breed_name}</Text>
              <View style={styles.locationContainer}>
                <Text style={styles.locationIcon}>📍</Text>
                <PetLocationDisplay pet={pet} style={styles.petLocation} />
              </View>
            </View>
            <View style={styles.petBadges}>
              <View style={styles.petBadge}>
                <Text style={styles.petBadgeText}>{pet.pet_type_display}</Text>
              </View>
              <View style={[styles.petBadge, styles.genderBadge]}>
                <Text style={styles.petBadgeText}>{pet.gender_display}</Text>
              </View>
              <View style={[styles.petBadge, styles.statusBadge]}>
                <Text style={styles.petBadgeText}>{pet.status_display}</Text>
              </View>
            </View>
          </View>

          {/* Quick Info */}
          <View style={styles.quickInfoCard}>
            <Text style={styles.sectionTitle}>ℹ️ معلومات سريعة</Text>
            <View style={styles.quickInfoGrid}>
              <View style={styles.quickInfoItem}>
                <Text style={styles.quickInfoIcon}>🎂</Text>
                <Text style={styles.quickInfoLabel}>العمر</Text>
                <Text style={styles.quickInfoValue}>{pet.age_display}</Text>
              </View>
              <View style={styles.quickInfoItem}>
                <Text style={styles.quickInfoIcon}>🏷️</Text>
                <Text style={styles.quickInfoLabel}>السلالة</Text>
                <Text style={styles.quickInfoValue}>{pet.breed_name}</Text>
              </View>
              <View style={styles.quickInfoItem}>
                <Text style={styles.quickInfoIcon}>🏠</Text>
                <Text style={styles.quickInfoLabel}>الحالة</Text>
                <Text style={styles.quickInfoValue}>{pet.status_display}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {pet.description && (
            <View style={styles.descriptionCard}>
              <Text style={styles.sectionTitle}>📝 الوصف</Text>
              <Text style={styles.description}>{pet.description}</Text>
            </View>
          )}



          {/* Verification Status */}
          <View style={styles.verificationCard}>
            <Text style={styles.sectionTitle}>🩺 حالة التوثيق</Text>
            <View style={styles.verificationItem}>
              <View style={[
                styles.verificationIconContainer,
                pet.has_health_certificates ? styles.verifiedIcon : styles.unverifiedIcon
              ]}>
                <Text style={styles.verificationIcon}>
                  {pet.has_health_certificates ? '✓' : '✗'}
                </Text>
              </View>
              <Text style={[
                styles.verificationText,
                pet.has_health_certificates ? styles.verifiedText : styles.unverifiedText
              ]}>
                {pet.has_health_certificates ? 'موثق طبياً' : 'غير موثق طبياً'}
              </Text>
            </View>
          </View>

          {/* Owner Info (without email) */}
          <View style={styles.ownerCard}>
            <Text style={styles.sectionTitle}>👤 معلومات المالك</Text>
            <View style={styles.ownerInfo}>
              <View style={styles.ownerIconContainer}>
                <Text style={styles.ownerIcon}>👨‍💼</Text>
              </View>
              <View style={styles.ownerDetails}>
                <Text style={styles.ownerName}>{pet.owner_name}</Text>
                <View style={styles.ownerRating}>
                  <Text style={styles.ratingStars}>⭐⭐⭐⭐⭐</Text>
                  <Text style={styles.ratingText}>مالك موثق</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Action Buttons - Only Breeding Request */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.breedingButton} onPress={requestBreeding}>
          <Text style={styles.breedingButtonText}>💖 طلب تزاوج</Text>
        </TouchableOpacity>
      </View>

      {/* Image Modal */}
      <Modal
        visible={showImageModal}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageModal}
      >
        <View style={styles.modalOverlay}>
          <StatusBar backgroundColor="rgba(0,0,0,0.9)" barStyle="light-content" />
          <TouchableOpacity
            style={styles.modalCloseArea}
            activeOpacity={1}
            onPress={closeImageModal}
          >
            <View style={styles.modalContent}>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={closeImageModal}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      </Modal>
      </View>
    </SafeAreaView>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#667eea',
  },
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

  // Header
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
  headerButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  headerButtonText: {
    fontSize: 20,
    color: '#64748b',
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  favoriteIcon: {
    fontSize: 24,
  },

  // Content
  content: {
    flex: 1,
  },

  // Main Image
  mainImage: {
    width: width,
    height: 300,
    backgroundColor: '#e2e8f0',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },

  // Additional Images
  additionalImagesContainer: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  additionalImagesScroll: {
    paddingHorizontal: 18,
  },
  additionalImageContainer: {
    marginRight: 12,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  additionalImage: {
    width: 140,
    height: 140,
    backgroundColor: '#e2e8f0',
  },

  // Pet Info
  petInfo: {
    padding: 20,
  },

  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 15,
  },

  // Pet Header Card
  petHeaderCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  petHeaderContent: {
    marginBottom: 15,
  },
  petName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  petBreed: {
    fontSize: 18,
    color: '#64748b',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  petLocation: {
    fontSize: 16,
    color: '#64748b',
  },
  petBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  petBadge: {
    backgroundColor: '#667eea',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  genderBadge: {
    backgroundColor: '#10b981',
  },
  statusBadge: {
    backgroundColor: '#f59e0b',
  },
  petBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  // Quick Info Card
  quickInfoCard: {
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
  quickInfoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickInfoItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    marginHorizontal: 4,
  },
  quickInfoIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickInfoLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  quickInfoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Description Card
  descriptionCard: {
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
  description: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
    textAlign: 'right',
  },



  // Verification Card
  verificationCard: {
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
  verificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  verificationIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  verifiedIcon: {
    backgroundColor: '#10b981',
  },
  unverifiedIcon: {
    backgroundColor: '#ef4444',
  },
  verificationIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  verificationText: {
    fontSize: 16,
    fontWeight: '600',
  },
  verifiedText: {
    color: '#10b981',
  },
  unverifiedText: {
    color: '#ef4444',
  },

  // Owner Card
  ownerCard: {
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
  ownerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ownerIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  ownerIcon: {
    fontSize: 24,
    color: '#fff',
  },
  ownerDetails: {
    flex: 1,
  },
  ownerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 6,
  },
  ownerRating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingStars: {
    fontSize: 14,
    marginRight: 8,
  },
  ratingText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },

  // Action Buttons
  actionButtons: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  breedingButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  breedingButtonText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
  },
  primaryButton: {
    backgroundColor: '#667eea',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalImage: {
    width: width,
    height: height * 0.8,
  },
});

export default PetDetailsScreen;
