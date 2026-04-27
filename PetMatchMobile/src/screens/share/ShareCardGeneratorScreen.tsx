import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import ViewShot from 'react-native-view-shot';
import QRCode from 'react-native-qrcode-svg';
import Share from 'react-native-share';
import { apiService, Pet } from '../../services/api';
import { PUBLIC_WEB_URL } from '../../services/config';
import { getRandomPhrase } from '../../utils/funnyPhrases';
import { creativePacks, CreativeThemeKey } from '../../content/shareCardPacks';
import { generateCardText } from '../../utils/shareCardEngine';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = CARD_WIDTH * 1.4; // Portrait ratio

interface ShareCardGeneratorScreenProps {
  onClose: () => void;
}

type CardType = 'adoption' | 'breeding';

const ShareCardGeneratorScreen: React.FC<ShareCardGeneratorScreenProps> = ({ onClose }) => {
  const [cardType, setCardType] = useState<CardType>('adoption');
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [selectedPet, setSelectedPet] = useState<Pet | null>(null);
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [funnyPhrase, setFunnyPhrase] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [theme, setTheme] = useState<CreativeThemeKey | 'auto'>('auto');
  const [layout, setLayout] = useState<'poster' | 'chat'>('poster');
  const [showBadges, setShowBadges] = useState<boolean>(true);
  const [showCTA, setShowCTA] = useState<boolean>(true);
  const [customGender, setCustomGender] = useState<'M' | 'F'>('M');
  const viewShotRef = useRef<ViewShot>(null);

  useEffect(() => {
    loadMyPets();
    generateNewPhrase();
  }, []);

  useEffect(() => {
    generateNewPhrase();
  }, [cardType, selectedPet]);

  const loadMyPets = async () => {
    try {
      setLoading(true);
      const response = await apiService.getMyPets();
      if (response.success && response.data) {
        setMyPets(response.data.results || []);
      }
    } catch (error) {
      console.error('Error loading pets:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateNewPhrase = () => {
    const gender = (selectedPet?.gender as 'M' | 'F') || customGender || 'M';
    // Backwards-compatible phrase (used as fallback/old design)
    const fallback = getRandomPhrase(cardType, gender);
    setFunnyPhrase(fallback);
  };

  const selectPet = (pet: Pet) => {
    setSelectedPet(pet);
    setCustomImage(null); // Clear custom image when selecting a pet
  };

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
      });

      if (result.didCancel) {
        return;
      }

      if (result.assets && result.assets[0]) {
        const imageUri = result.assets[0].uri;
        if (imageUri) {
          setCustomImage(imageUri);
          setSelectedPet(null); // Clear selected pet when picking custom image
        }
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('خطأ', 'فشل في اختيار الصورة');
    }
  };

  const getDisplayImage = () => {
    if (customImage) return customImage;
    if (selectedPet?.main_image) {
      return selectedPet.main_image.replace('http://', 'https://');
    }
    return 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=400&q=80';
  };

  const generateAndShare = async () => {
    if (!customImage && !selectedPet) {
      Alert.alert('تنبيه', 'الرجاء اختيار حيوان أو صورة أولاً');
      return;
    }

    try {
      setGenerating(true);

      // Capture the card as image
      const uri = await viewShotRef.current?.capture?.();
      
      if (!uri) {
        throw new Error('فشل في إنشاء الصورة');
      }

      // Prepare share options
      const shareOptions = {
        title: 'شارك من PetMatch',
        message: `${funnyPhrase}\n\nحمّل تطبيق PetMatch الآن!\n${PUBLIC_WEB_URL}`,
        url: Platform.OS === 'ios' ? uri : `file://${uri}`,
        type: 'image/png',
      };

      // Share the image
      await Share.open(shareOptions);
      
    } catch (error: any) {
      console.error('Error sharing:', error);
      if (error?.message !== 'User did not share') {
        Alert.alert('خطأ', 'فشل في مشاركة الكرت');
      }
    } finally {
      setGenerating(false);
    }
  };

  const renderPetSelector = () => (
    <View style={styles.selectorContainer}>
      <Text style={styles.selectorTitle}>اختر حيوان من قائمتك:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.petsList}>
        {myPets.map((pet) => (
          <TouchableOpacity
            key={pet.id}
            style={[
              styles.petItem,
              selectedPet?.id === pet.id && styles.petItemSelected,
            ]}
            onPress={() => selectPet(pet)}
          >
            <Image
              source={{ uri: pet.main_image?.replace('http://', 'https://') }}
              style={styles.petThumbnail}
            />
            <Text style={styles.petName}>{pet.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>أو</Text>
        <View style={styles.dividerLine} />
      </View>

      <TouchableOpacity style={styles.customImageButton} onPress={pickImage}>
        <Text style={styles.customImageButtonText}>📷 اختر صورة من المعرض</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCard = () => {
    const displayImage = getDisplayImage();
    const gender = (selectedPet?.gender as 'M' | 'F') || customGender || 'M';
    const ctxName = selectedPet?.name || null;
    const ctxAge = selectedPet?.age_display || null;
    const ctxArea = selectedPet?.location || null;
    const cardText = generateCardText({
      cardType,
      gender,
      name: ctxName,
      age: ctxAge,
      area: ctxArea,
      theme,
    });
    
    return (
      <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
        <View style={styles.card}>
          {/* Background Image - Full Card */}
          <Image 
            source={{ uri: displayImage }} 
            style={styles.backgroundImage}
            resizeMode="cover"
          />
          
          {/* Dark Overlay for text readability */}
          <View style={styles.darkOverlay} />
          
          {/* Content Container */}
          <View style={styles.contentContainer}>
            {/* Card Type Badge */}
            <View style={styles.cardTypeBadge}>
              <Text style={styles.cardTypeBadgeText}>
                {cardType === 'adoption' ? '🏠 للتبني' : '💕 للتزاوج'}
              </Text>
            </View>

            {/* Funny Phrase - Main Text */}
            <View style={styles.phraseContainer}>
              {layout === 'chat' ? (
                // Chat layout shows bubbles later; here show nothing
                <></>
              ) : (
                <>
                  <Text style={styles.phraseText}>{cardText.title || funnyPhrase}</Text>
                  {cardText.subtitle ? (
                    <Text style={styles.phraseSubtitle}>{cardText.subtitle}</Text>
                  ) : null}
                  {showBadges && cardText.badges?.length ? (
                    <View style={styles.badgesRow}>
                      {cardText.badges.map((b, i) => (
                        <View key={i} style={styles.badgeChip}><Text style={styles.badgeChipText}>{b}</Text></View>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </View>

            {/* Spacer to push content to bottom */}
            <View style={styles.spacer} />

            {/* Pet Info */}
            {selectedPet && (
              <View style={styles.petInfoContainer}>
                <Text style={styles.petInfoName}>{selectedPet.name}</Text>
                <Text style={styles.petInfoDetails}>
                  {selectedPet.breed_name} • {selectedPet.age_display}
                </Text>
                <Text style={styles.petInfoLocation}>📍 {selectedPet.location}</Text>
              </View>
            )}

            {/* Chat bubbles layout */}
            {layout === 'chat' ? (
              <View style={styles.chatWrap}>
                {cardText.title.split('\n').map((line, idx) => (
                  <View key={`chat-${idx}`} style={[styles.chatBubble, idx % 2 ? styles.chatRight : styles.chatLeft]}>
                    <Text style={styles.chatText}>{line}</Text>
                  </View>
                ))}
                {cardText.subtitle ? (
                  <View style={[styles.chatBubble, styles.chatLeft]}>
                    <Text style={styles.chatText}>{cardText.subtitle}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* App Branding - Compact */}
            <View style={styles.brandingContainer}>
              <View style={styles.brandingLeft}>
                <Text style={styles.brandingTitle}>Petow</Text>
                <Text style={styles.brandingSubtitle}>كلمني واتساب</Text>
                {showCTA && cardText.ctas?.length ? (
                  <Text style={styles.brandingCta}>{cardText.ctas[0]}</Text>
                ) : null}
              </View>
              
              {/* QR Code - Smaller */}
              <View style={styles.qrContainer}>
                <QRCode
                  value={PUBLIC_WEB_URL}
                  size={50}
                  backgroundColor="white"
                  color="#1e293b"
                />
              </View>
            </View>
          </View>
        </View>
      </ViewShot>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>إنشاء كرت مشاركة</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Card Type Selector */}
        <View style={styles.cardTypeSelector}>
          <TouchableOpacity
            style={[
              styles.cardTypeButton,
              cardType === 'adoption' && styles.cardTypeButtonActive,
            ]}
            onPress={() => setCardType('adoption')}
          >
            <Text
              style={[
                styles.cardTypeButtonText,
                cardType === 'adoption' && styles.cardTypeButtonTextActive,
              ]}
            >
              🏠 للتبني
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.cardTypeButton,
              cardType === 'breeding' && styles.cardTypeButtonActive,
            ]}
            onPress={() => setCardType('breeding')}
          >
            <Text
              style={[
                styles.cardTypeButtonText,
                cardType === 'breeding' && styles.cardTypeButtonTextActive,
              ]}
            >
              💕 للتزاوج
            </Text>
          </TouchableOpacity>
        </View>

        {/* Theme/Layout/Options */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <TouchableOpacity onPress={() => setTheme('auto')} style={[styles.themeChip, theme === 'auto' && styles.themeChipActive]}>
            <Text style={[styles.themeChipText, theme === 'auto' && styles.themeChipTextActive]}>تلقائي</Text>
          </TouchableOpacity>
          {creativePacks.filter(p => p.allow.includes(cardType)).map(p => (
            <TouchableOpacity key={p.key} onPress={() => setTheme(p.key as CreativeThemeKey)} style={[styles.themeChip, theme === (p.key as CreativeThemeKey) && styles.themeChipActive]}>
              <Text style={[styles.themeChipText, theme === (p.key as CreativeThemeKey) && styles.themeChipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.layoutRow}>
          <TouchableOpacity onPress={() => setLayout('poster')} style={[styles.layoutBtn, layout === 'poster' && styles.layoutBtnActive]}>
            <Text style={[styles.layoutBtnText, layout === 'poster' && styles.layoutBtnTextActive]}>🎞️ Poster</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setLayout('chat')} style={[styles.layoutBtn, layout === 'chat' && styles.layoutBtnActive]}>
            <Text style={[styles.layoutBtnText, layout === 'chat' && styles.layoutBtnTextActive]}>💬 Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowBadges(!showBadges)} style={[styles.layoutBtn, showBadges && styles.layoutBtnActive]}>
            <Text style={[styles.layoutBtnText, showBadges && styles.layoutBtnTextActive]}>🏷️ Badges</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowCTA(!showCTA)} style={[styles.layoutBtn, showCTA && styles.layoutBtnActive]}>
            <Text style={[styles.layoutBtnText, showCTA && styles.layoutBtnTextActive]}>📣 CTA</Text>
          </TouchableOpacity>
        </View>

        {/* Gender switch when using custom image */}
        {customImage && !selectedPet ? (
          <View style={styles.layoutRow}>
            <TouchableOpacity onPress={() => setCustomGender('M')} style={[styles.layoutBtn, customGender === 'M' && styles.layoutBtnActive]}>
              <Text style={[styles.layoutBtnText, customGender === 'M' && styles.layoutBtnTextActive]}>ذكر</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCustomGender('F')} style={[styles.layoutBtn, customGender === 'F' && styles.layoutBtnActive]}>
              <Text style={[styles.layoutBtnText, customGender === 'F' && styles.layoutBtnTextActive]}>أنثى</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Pet/Image Selector */}
        {renderPetSelector()}

        {/* Card Preview */}
        <View style={styles.previewContainer}>
          <Text style={styles.previewTitle}>معاينة الكرت:</Text>
          {renderCard()}
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.regenerateButton}
            onPress={generateNewPhrase}
          >
            <Text style={styles.regenerateButtonText}>🎲 جملة جديدة</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.shareButton, generating && styles.shareButtonDisabled]}
            onPress={generateAndShare}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.shareButtonText}>📤 مشاركة</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 نصائح:</Text>
          <Text style={styles.tipsText}>
            • اختر صورة واضحة وجميلة لحيوانك{'\n'}
            • جرب جمل مختلفة حتى تجد الأنسب{'\n'}
            • شارك على أكبر عدد من المنصات{'\n'}
            • QR Code يؤدي لرابط تحميل التطبيق
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#64748b',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  cardTypeSelector: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  cardTypeButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  cardTypeButtonActive: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  cardTypeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  cardTypeButtonTextActive: {
    color: '#667eea',
  },
  selectorContainer: {
    marginBottom: 20,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  petsList: {
    marginBottom: 16,
  },
  petItem: {
    marginRight: 12,
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  petItemSelected: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
  },
  petThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e2e8f0',
  },
  petName: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#64748b',
  },
  customImageButton: {
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#667eea',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  customImageButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#667eea',
  },
  previewContainer: {
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
  },
  backgroundImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
  },
  darkOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  contentContainer: {
    flex: 1,
    padding: 20,
    zIndex: 10,
  },
  cardTypeBadge: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 20,
  },
  cardTypeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  phraseContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  phraseText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
    lineHeight: 38,
  },
  phraseSubtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#f3f4f6',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  badgeChip: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginHorizontal: 4,
    marginVertical: 3,
  },
  badgeChipText: {
    color: '#1e293b',
    fontSize: 11,
    fontWeight: '700',
  },
  spacer: {
    flex: 1,
  },
  petInfoContainer: {
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  petInfoName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  petInfoDetails: {
    fontSize: 14,
    color: '#fff',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  petInfoLocation: {
    fontSize: 12,
    color: '#fff',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  brandingContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  brandingLeft: {
    flex: 1,
  },
  brandingTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  brandingSubtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 2,
  },
  brandingCta: {
    fontSize: 10,
    color: '#111827',
    marginTop: 4,
  },
  qrContainer: {
    padding: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  regenerateButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#667eea',
    alignItems: 'center',
  },
  regenerateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#667eea',
  },
  shareButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: '#667eea',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  shareButtonDisabled: {
    opacity: 0.6,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  tipsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 22,
  },
  // Theme & layout controls
  themeChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  themeChipActive: {
    backgroundColor: '#e0e7ff',
    borderColor: '#667eea',
  },
  themeChipText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  themeChipTextActive: {
    color: '#3730a3',
  },
  layoutRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  layoutBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  layoutBtnActive: {
    backgroundColor: '#f0f4ff',
    borderColor: '#667eea',
  },
  layoutBtnText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '700',
  },
  layoutBtnTextActive: {
    color: '#3730a3',
  },
  // Chat bubbles
  chatWrap: {
    marginBottom: 12,
  },
  chatBubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    marginVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  chatLeft: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  chatRight: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(16,185,129,0.9)',
  },
  chatText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ShareCardGeneratorScreen;
