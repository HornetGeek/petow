import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiService, Pet } from '../../services/api';
import PetDetailsScreen from '../pets/PetDetailsScreen';
import EditPetScreen from '../pets/EditPetScreen';

interface MyPetsScreenProps {
  onClose: () => void;
}

const MyPetsScreen: React.FC<MyPetsScreenProps> = ({ onClose }) => {
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [editingPetId, setEditingPetId] = useState<number | null>(null);

  useEffect(() => {
    loadPets();
  }, []);

  const loadPets = async () => {
    try {
      setLoading(true);
      const response = await apiService.getMyPets();
      
      if (response.success && response.data) {
        setPets(response.data.results);
        console.log('My pets loaded:', response.data.results);
      } else {
        console.log('Failed to load pets:', response.error);
        setPets([]);
      }
    } catch (error) {
      console.error('Error loading pets:', error);
      setPets([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPets();
    setRefreshing(false);
  };

  const showPetDetails = (petId: number) => {
    setSelectedPetId(petId);
  };

  const hidePetDetails = () => {
    setSelectedPetId(null);
  };

  const showEditPet = (petId: number) => {
    setEditingPetId(petId);
  };

  const hideEditPet = () => {
    setEditingPetId(null);
  };

  const deletePet = async (petId: number, petName: string) => {
    Alert.alert(
      'حذف الحيوان',
      `هل أنت متأكد من حذف ${petName}؟`,
      [
        { text: 'إلغاء', style: 'cancel' },
        { 
          text: 'حذف', 
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await apiService.deletePet(petId);
              if (response.success) {
                Alert.alert('نجح', 'تم حذف الحيوان بنجاح');
                loadPets(); // Refresh the list
              } else {
                Alert.alert('خطأ', 'فشل في حذف الحيوان');
              }
            } catch (error) {
              Alert.alert('خطأ', 'فشل في حذف الحيوان');
            }
          }
        },
      ]
    );
  };

  const renderPetCard = (pet: Pet) => {
    if (!pet) return null;
    
    const imageUrl = pet.main_image?.replace('http://', 'https://') || 'https://images.unsplash.com/photo-1534361960057-19889db9621e?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80';
    
    return (
      <TouchableOpacity 
        key={pet.id}
        style={styles.petCard}
        onPress={() => showPetDetails(pet.id)}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.petImage}
        />
        <View style={styles.petInfo}>
          <Text style={styles.petName}>{pet.name}</Text>
          <Text style={styles.petBreed}>{pet.breed_name}</Text>
          <Text style={styles.petType}>{pet.pet_type_display} - {pet.gender_display}</Text>
          <Text style={styles.petStatus}>{pet.status_display}</Text>
        </View>
        <TouchableOpacity 
          style={styles.editButton}
          onPress={() => showEditPet(pet.id)}
        >
          <Text style={styles.editButtonText}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => deletePet(pet.id, pet.name)}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (selectedPetId) {
    return (
      <PetDetailsScreen 
        petId={selectedPetId} 
        onClose={hidePetDetails} 
      />
    );
  }

  if (editingPetId) {
    return (
      <EditPetScreen 
        petId={editingPetId} 
        onClose={hideEditPet}
        onPetUpdated={loadPets}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>حيواناتي</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#02B7B4" />
            <Text style={styles.loadingText}>جاري تحميل الحيوانات...</Text>
          </View>
        ) : pets.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🐕</Text>
            <Text style={styles.emptyTitle}>لا توجد حيوانات</Text>
            <Text style={styles.emptyDescription}>
              لم تقم بإضافة أي حيوانات بعد. اضغط على زر "إضافة حيوان" لإضافة حيوانك الأليف.
            </Text>
          </View>
        ) : (
          <View style={styles.petsGrid}>
            {pets.map(renderPetCard)}
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
  petsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  petCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e1e8ed',
  },
  petImage: {
    width: '100%',
    height: 120,
    backgroundColor: '#e1e8ed',
  },
  petInfo: {
    padding: 12,
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
  petType: {
    fontSize: 12,
    color: '#95a5a6',
    marginBottom: 2,
  },
  petStatus: {
    fontSize: 12,
    color: '#02B7B4',
    fontWeight: '600',
  },
  editButton: {
    position: 'absolute',
    top: 8,
    right: 45,
    backgroundColor: 'rgba(52, 152, 219, 0.9)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
  },
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
  },
});

export default MyPetsScreen;
