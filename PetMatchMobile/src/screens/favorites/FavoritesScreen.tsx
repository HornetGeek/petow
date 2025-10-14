import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { apiService, Pet } from '../../services/api';

interface FavoritesScreenProps {
  onClose: () => void;
}

// Interface for the actual API response structure
interface FavoriteItem {
  id: number;
  pet: Pet;
  created_at: string;
}

interface FavoritesResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FavoriteItem[];
}

const FavoritesScreen: React.FC<FavoritesScreenProps> = ({ onClose }) => {
  const [favorites, setFavorites] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('❤️ FavoritesScreen - Loading favorites...');
      
      const response = await apiService.getFavorites();
      console.log('❤️ FavoritesScreen - API Response:', response);
      
      if (response.success && response.data) {
        // Handle the actual API response structure
        const favoritesData = response.data as FavoritesResponse;
        console.log('❤️ FavoritesScreen - Favorites data:', favoritesData);
        
        // Extract pets from the results array
        const pets = favoritesData.results.map(item => item.pet);
        console.log('❤️ FavoritesScreen - Extracted pets:', pets);
        
        setFavorites(pets);
      } else {
        console.log('❤️ FavoritesScreen - Failed to load favorites:', response.error);
        setError('فشل في تحميل المفضلة');
        setFavorites([]);
      }
    } catch (error) {
      console.error('❤️ FavoritesScreen - Error loading favorites:', error);
      setError('حدث خطأ في تحميل المفضلة');
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadFavorites();
    setRefreshing(false);
  };

  const removeFromFavorites = async (petId: number) => {
    try {
      console.log('❤️ FavoritesScreen - Removing pet from favorites:', petId);
      const response = await apiService.toggleFavorite(petId);
      
      if (response.success) {
        console.log('❤️ FavoritesScreen - Pet removed from favorites');
        // Refresh the list
        await loadFavorites();
      } else {
        Alert.alert('خطأ', 'فشل في إزالة الحيوان من المفضلة');
      }
    } catch (error) {
      console.error('❤️ FavoritesScreen - Error removing from favorites:', error);
      Alert.alert('خطأ', 'حدث خطأ في إزالة الحيوان من المفضلة');
    }
  };

  const renderPetCard = (pet: Pet) => {
    if (!pet) return null;
    
    const imageUrl = pet.main_image?.replace('http://', 'https://') || 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80';
    
    return (
      <TouchableOpacity key={pet.id} style={styles.petCard}>
        <Image
          source={{ uri: imageUrl }}
          style={styles.petImage}
          onError={(error) => {
            console.log('❌ FavoritesScreen - Image load error for pet:', pet.id);
          }}
        />
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{pet.name || 'غير محدد'}</Text>
          <Text style={styles.petBreed}>{pet.breed_name || 'غير محدد'}</Text>
          <Text style={styles.petAge}>{pet.age_display || 'غير محدد'}</Text>
          <Text style={styles.petLocation}>{pet.location || 'غير محدد'}</Text>
        </View>
        <TouchableOpacity 
          style={styles.removeButton}
          onPress={() => removeFromFavorites(pet.id)}
        >
          <Text style={styles.removeButtonText}>❌</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>المفضلة</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#02B7B4" />
          <Text style={styles.loadingText}>جاري تحميل المفضلة...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>المفضلة</Text>
          <View style={styles.placeholder} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>خطأ في التحميل</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadFavorites}>
            <Text style={styles.retryButtonText}>إعادة المحاولة</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>المفضلة ({favorites.length})</Text>
        <View style={styles.placeholder} />
      </View>
      
      <ScrollView 
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {favorites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>💔</Text>
            <Text style={styles.emptyTitle}>لا توجد مفضلة</Text>
            <Text style={styles.emptyDescription}>
              لم تقم بإضافة أي حيوانات للمفضلة بعد. تصفح الحيوانات واضغط على القلب لإضافتها للمفضلة.
            </Text>
          </View>
        ) : (
          <View style={styles.petsList}>
            {favorites.map(renderPetCard)}
          </View>
        )}
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
  closeButton: {
    padding: 10,
  },
  closeButtonText: {
    fontSize: 20,
    color: '#7f8c8d',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 10,
    color: '#7f8c8d',
    fontSize: 16,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#e74c3c',
    marginBottom: 10,
  },
  errorMessage: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#02B7B4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#7f8c8d',
    textAlign: 'center',
    lineHeight: 24,
  },
  petsList: {
    gap: 15,
  },
  petCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  petImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#e1e8ed',
  },
  petInfo: {
    flex: 1,
    marginLeft: 15,
  },
  petName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  petBreed: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  petAge: {
    fontSize: 12,
    color: '#95a5a6',
    marginBottom: 2,
  },
  petLocation: {
    fontSize: 12,
    color: '#95a5a6',
  },
  removeButton: {
    padding: 10,
  },
  removeButtonText: {
    fontSize: 18,
  },
});

export default FavoritesScreen;
